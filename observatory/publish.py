# SPDX-License-Identifier: LicenseRef-QOSL-1.0
# Copyright (c) 2026 Quavern
# This file is subject to the Quavern Open Source License, version 1.0.
# A copy is available at https://oss.quavern.com/licences/qosl/1.0/
"""Turn a day of samples into the published files, then commit and push them.

A day is a UTC date. Rates are summed over the samples taken between 06:00 and
22:00 in each network's own time zone; night samples are counted apart. Nothing
published names a URL, an identifier, an exception text or a quota figure.
"""

from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
import statistics
import hashlib
import os
import subprocess
import tarfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from . import metrics
from .collector import iso, load_descriptors, utc_now

SCHEMA_ID = "quavsit-observatory/1"
SAMPLES_SCHEDULED = 8
SERVICE_START, SERVICE_END = 6, 22
FAILURES = ("timeout", "connection", "http_4xx", "http_5xx", "decode_error", "budget")
RATE_MEMBERS = {
    "trip_updates": ("trip_join", "stop_updates_timed", "cancelled"),
    "vehicle_positions": ("with_position", "with_trip_id", "with_route_id", "trip_join"),
    "alerts": ("informed_resolved",),
}
SUM_MEMBERS = {"trip_updates": ("no_trip_id",)}
HISTORY_DAYS = 90
RAW_RETENTION_DAYS = 35


# ---- redaction ---------------------------------------------------------------------------

_URL = re.compile(r"https?://[^\s#'\"<>]+")


def error_reason(text: str | None) -> dict | None:
    """A refresh error as a reason word and a host, never the text itself."""
    if not text:
        return None
    lowered = text.lower()
    if "timeout" in lowered:
        reason = "timeout"
    elif re.search(r"http 4\d\d", lowered):
        reason = "http_4xx"
    elif re.search(r"http 5\d\d", lowered):
        reason = "http_5xx"
    elif "zip" in lowered or "archive is not" in lowered:
        reason = "archive_invalid"
    elif any(word in lowered for word in ("disconnected", "connection", "refused", "reset", "unreachable", "name or service")):
        reason = "connection"
    else:
        reason = "error"
    match = _URL.search(text)
    host = (urlsplit(match.group(0)).hostname or None) if match else None
    return {"reason": reason, "host": host}


# ---- aggregation -------------------------------------------------------------------------


def _parse(moment: str) -> datetime:
    return datetime.fromisoformat(moment.replace("Z", "+00:00"))


def _gtfs_date(value: str | None) -> date | None:
    if value and re.fullmatch(r"\d{8}", value):
        return date(int(value[:4]), int(value[4:6]), int(value[6:]))
    return None


def static_facts(transit: sqlite3.Connection, descriptor: dict, day: date, now: datetime) -> dict:
    slug = descriptor["id"]
    kind = (descriptor.get("static") or {}).get("kind")
    row = transit.execute(
        "SELECT refreshed_at, stats_json, error FROM network_static WHERE network = ?", (slug,)
    ).fetchone()
    refreshed_at, stats_json, error = row if row else (None, None, None)
    facts = {
        "state": "never_ingested" if not refreshed_at else ("error" if error else "ok"),
        "refreshed_at": None,
        "age_hours": None,
        "timetable_ends_on": None,
        "days_left": None,
        "counts": None,
        "pan_dataset_slug": (descriptor.get("static") or {}).get("pan_dataset_slug"),
        "last_error": error_reason(error),
    }
    if refreshed_at:
        moment = _parse(refreshed_at)
        facts["refreshed_at"] = iso(moment)
        facts["age_hours"] = round((now - moment).total_seconds() / 3600, 1)
    if stats_json:
        stats = json.loads(stats_json)
        counts = {
            "lines": stats.get("rows_lines"),
            "stops": stats.get("rows_stops"),
            "trips": stats.get("rows_gtfs_trips"),
            "stop_times": stats.get("rows_gtfs_stop_times"),
        }
        facts["counts"] = counts if any(value is not None for value in counts.values()) else None
    if kind in ("ods", "navitia"):
        facts["timetable_ends_on_reason"] = "not_gtfs"
    elif refreshed_at:
        weekly = transit.execute(
            "SELECT MAX(end_date) FROM gtfs_calendar WHERE network = ? "
            "AND (monday + tuesday + wednesday + thursday + friday + saturday + sunday) > 0",
            (slug,),
        ).fetchone()[0]
        added = transit.execute(
            "SELECT MAX(date) FROM gtfs_calendar_dates WHERE network = ? AND exception_type = 1", (slug,)
        ).fetchone()[0]
        ends = [value for value in (_gtfs_date(weekly), _gtfs_date(added)) if value]
        if ends:
            last = max(ends)
            facts["timetable_ends_on"] = last.isoformat()
            facts["days_left"] = (last - day).days
    return facts


def engine_observed(transit: sqlite3.Connection, descriptor: dict) -> list[dict]:
    """The engine's own traffic to a native network's keyed products: timestamps and a state only."""
    if descriptor.get("adapter", "gtfs") == "gtfs":
        return []
    slug = descriptor["id"]
    observed = []
    for product, last_ok_at, last_error_at in transit.execute(
        "SELECT product, last_ok_at, last_error_at FROM upstream_status WHERE product LIKE ? ORDER BY product",
        (f"{slug}:%",),
    ):
        if ":gtfs-rt:" in product or ":gtfs:static" in product:
            continue
        if last_ok_at and (not last_error_at or last_ok_at >= last_error_at):
            state = "ok"
        elif last_error_at:
            state = "down"
        else:
            state = "unknown"
        observed.append(
            {"source": product, "last_ok_at": last_ok_at, "last_error_at": last_error_at, "state": state}
        )
    return observed


def realtime_block(rows: list[sqlite3.Row], kind: str, zone: ZoneInfo) -> dict:
    block = {
        "host": rows[0]["host"],
        "samples": 0,
        "ok": 0,
        "failures": {reason: 0 for reason in FAILURES},
        "rate_limited": 0,
        "samples_night": 0,
        "header_age_seconds": None,
        "no_header_timestamp": 0,
        "entities": None,
    }
    for member in RATE_MEMBERS[kind]:
        block[member] = None
    for member in SUM_MEMBERS.get(kind, ()):
        block[member] = 0
    ages, entities = [], []
    sums: dict[str, list[int] | None] = {}
    for row in rows:
        local_hour = _parse(row["fetched_at"]).astimezone(zone).hour
        if not SERVICE_START <= local_hour < SERVICE_END:
            block["samples_night"] += 1
            continue
        block["samples"] += 1
        outcome = row["outcome"]
        if outcome == "rate_limited":
            block["rate_limited"] += 1
            continue
        if outcome != "ok":
            block["failures"][outcome if outcome in FAILURES else "connection"] += 1
            continue
        block["ok"] += 1
        fetched = _parse(row["fetched_at"]).timestamp()
        if row["header_timestamp"]:
            ages.append(max(0, int(fetched - row["header_timestamp"])))
        else:
            block["no_header_timestamp"] += 1
        if row["entity_count"] is not None:
            entities.append(row["entity_count"])
        counts = json.loads(row["counts_json"] or "{}")
        for member in RATE_MEMBERS[kind]:
            value = counts.get(member)
            if value is None:
                sums.setdefault(member, None)
                continue
            total = sums.get(member) or [0, 0]
            total[0] += value["n"]
            total[1] += value["of"]
            sums[member] = total
        for member in SUM_MEMBERS.get(kind, ()):
            block[member] += int(counts.get(member) or 0)
    for member, total in sums.items():
        block[member] = metrics.rate(*total) if total is not None else None
    if ages:
        block["header_age_seconds"] = int(statistics.median(ages))
    if entities:
        block["entities"] = int(statistics.median(entities))
    return block


def build_day(db: sqlite3.Connection, transit: sqlite3.Connection, descriptors: dict[str, dict], day: date, now: datetime) -> dict:
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    db.row_factory = sqlite3.Row
    samples = db.execute(
        "SELECT id FROM samples WHERE started_at >= ? AND started_at < ? AND finished_at IS NOT NULL",
        (iso(start), iso(end)),
    ).fetchall()
    sample_ids = [row["id"] for row in samples]
    rows_by_feed: dict[tuple[str, str], list[sqlite3.Row]] = {}
    if sample_ids:
        marks = ",".join("?" * len(sample_ids))
        for row in db.execute(
            f"SELECT * FROM feed_samples WHERE sample_id IN ({marks}) ORDER BY fetched_at", sample_ids
        ):
            rows_by_feed.setdefault((row["network"], row["kind"]), []).append(row)
    commits = [
        row[0] for row in db.execute(
            f"SELECT DISTINCT engine_commit FROM samples WHERE id IN ({','.join('?' * len(sample_ids))})", sample_ids
        )
    ] if sample_ids else []

    networks = []
    for slug, descriptor in descriptors.items():
        zone = ZoneInfo(descriptor.get("timezone") or "Europe/Paris")
        declared = [kind for kind in metrics.KINDS if ((descriptor.get("realtime") or {}).get(kind) or {}).get("url")]
        realtime = {}
        for kind in declared:
            rows = rows_by_feed.get((slug, kind))
            realtime[kind] = realtime_block(rows, kind, zone) if rows else None
        taken = {row["sample_id"] for kind in declared for row in rows_by_feed.get((slug, kind), [])}
        networks.append(
            {
                "network": slug,
                "name": descriptor.get("name"),
                "city": descriptor.get("city"),
                "region": descriptor.get("region"),
                "timezone": descriptor.get("timezone"),
                "attribution": descriptor.get("attribution"),
                "samples_taken": len(taken),
                "static": static_facts(transit, descriptor, day, now),
                "realtime": realtime,
                "engine_observed": engine_observed(transit, descriptor),
            }
        )
    networks.sort(key=lambda item: ((item["region"] or "").lower(), (item["name"] or "").lower()))
    return {
        "schema": SCHEMA_ID,
        "day": day.isoformat(),
        "complete": day < now.date(),
        "generated_at": iso(now),
        "engine": {
            "code_sha256": ",".join(value for value in commits if value) or None,
            "service_hours": "06:00-22:00 local",
        },
        "samples_scheduled": SAMPLES_SCHEDULED,
        "samples_taken": len(sample_ids),
        "networks": networks,
    }


# ---- validation --------------------------------------------------------------------------


def _rate_ok(value) -> bool:
    return value is None or (
        isinstance(value, dict) and set(value) == {"n", "of"}
        and all(isinstance(value[key], int) and value[key] >= 0 for key in value) and value["n"] <= value["of"]
    )


def validate_day(document: dict) -> list[str]:
    """The checks that must pass before anything is written. Returns the problems found."""
    problems = []
    if document.get("schema") != SCHEMA_ID:
        problems.append("schema id")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(document.get("day"))):
        problems.append("day")
    text = json.dumps(document)
    if _URL.search(text.replace("https://transport.data.gouv.fr", "")):
        problems.append("a URL appears in the day file")
    for network in document.get("networks", []):
        slug = network.get("network")
        if network["static"]["state"] not in ("ok", "error", "never_ingested"):
            problems.append(f"{slug}: static.state")
        for kind, block in (network.get("realtime") or {}).items():
            if block is None:
                continue
            for member in RATE_MEMBERS[kind]:
                if not _rate_ok(block.get(member)):
                    problems.append(f"{slug}.{kind}.{member}")
            if block["ok"] + block["rate_limited"] + sum(block["failures"].values()) != block["samples"]:
                problems.append(f"{slug}.{kind}: outcomes do not add up to samples")
    return problems


# ---- files -------------------------------------------------------------------------------


def _dump(document) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def _history_rows(document: dict) -> list[list]:
    rows = []
    for network in document["networks"]:
        base = [document["day"], network["network"]]
        static = network["static"]
        for metric in ("state", "age_hours", "timetable_ends_on", "days_left"):
            rows.append(base + ["static", metric, "", "", "" if static.get(metric) is None else static[metric]])
        for kind, block in (network.get("realtime") or {}).items():
            if block is None:
                continue
            for metric in ("samples", "ok", "header_age_seconds", "entities", *SUM_MEMBERS.get(kind, ())):
                rows.append(base + [kind, metric, "", "", "" if block.get(metric) is None else block[metric]])
            for metric in RATE_MEMBERS[kind]:
                value = block.get(metric)
                rows.append(base + [kind, metric, "" if value is None else value["n"], "" if value is None else value["of"], ""])
    return rows


def write_files(repo: Path, document: dict) -> list[Path]:
    data = repo / "data"
    (data / "days").mkdir(parents=True, exist_ok=True)
    (data / "networks").mkdir(parents=True, exist_ok=True)
    written = []

    day_path = data / "days" / f"{document['day']}.json"
    day_path.write_text(_dump(document), encoding="utf-8")
    written.append(day_path)

    days = sorted((data / "days").glob("*.json"))
    latest = json.loads(days[-1].read_text(encoding="utf-8"))
    (data / "latest.json").write_text(_dump(latest), encoding="utf-8")
    written.append(data / "latest.json")

    recent = [json.loads(path.read_text(encoding="utf-8")) for path in days[-HISTORY_DAYS:]]
    by_network: dict[str, list] = {}
    for doc in recent:
        for network in doc["networks"]:
            by_network.setdefault(network["network"], []).append(
                {"day": doc["day"], "complete": doc.get("complete", True), "samples_taken": network["samples_taken"],
                 "static": network["static"], "realtime": network["realtime"]}
            )
    for slug, entries in by_network.items():
        path = data / "networks" / f"{slug}.json"
        path.write_text(_dump({"schema": SCHEMA_ID, "network": slug, "days": entries}), encoding="utf-8")
        written.append(path)

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["day", "network", "kind", "metric", "n", "of", "value"])
    for path in days:
        writer.writerows(_history_rows(json.loads(path.read_text(encoding="utf-8"))))
    (data / "history.csv").write_text(buffer.getvalue(), encoding="utf-8")
    written.append(data / "history.csv")
    return written


def export(repo: Path, target: Path) -> dict:
    """Pack data/ as data.tar.gz with its SHA-256 next to it, swapped in atomically.

    The repository pulls this archive (``.github/workflows/sync-data.yml``); the host holds
    no credential for GitHub.
    """
    target.mkdir(parents=True, exist_ok=True)
    staging = target / ".data.tar.gz.partial"
    with tarfile.open(staging, "w:gz") as archive:
        for path in sorted((repo / "data").rglob("*")):
            if path.is_file() and not path.name.startswith("."):
                info = archive.gettarinfo(str(path), arcname=str(path.relative_to(repo)))
                info.uid = info.gid = 0
                info.uname = info.gname = ""
                info.mtime = 0
                with path.open("rb") as handle:
                    archive.addfile(info, handle)
    digest = hashlib.sha256(staging.read_bytes()).hexdigest()
    (target / ".data.sha256.partial").write_text(f"{digest}  data.tar.gz\n", encoding="utf-8")
    os.chmod(staging, 0o644)
    os.chmod(target / ".data.sha256.partial", 0o644)
    os.replace(staging, target / "data.tar.gz")
    os.replace(target / ".data.sha256.partial", target / "data.sha256")
    return {"sha256": digest}


def publish(db_path: str, transit_db: str, networks_dir: Path, repo: Path, day: date, *, export_to: Path | None = None) -> dict:
    now = utc_now()
    descriptors = load_descriptors(networks_dir)
    db = sqlite3.connect(db_path, timeout=30)
    transit = sqlite3.connect(f"file:{transit_db}?mode=ro", uri=True, timeout=30)
    document = build_day(db, transit, descriptors, day, now)
    problems = validate_day(document)
    if problems:
        raise SystemExit("refusing to publish: " + "; ".join(problems[:20]))
    write_files(repo, document)
    result = {"day": document["day"], "complete": document["complete"], "networks": len(document["networks"]), "samples": document["samples_taken"]}
    if export_to is not None:
        result.update(export(repo, export_to))
    cutoff = iso(now - timedelta(days=RAW_RETENTION_DAYS))
    db.execute("DELETE FROM feed_samples WHERE fetched_at < ?", (cutoff,))
    db.execute("DELETE FROM samples WHERE started_at < ?", (cutoff,))
    db.commit()
    return result
