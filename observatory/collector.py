# SPDX-License-Identifier: LicenseRef-QOSL-1.0
# Copyright (c) 2026 Quavern
# This file is subject to the Quavern Open Source License, version 1.0.
# A copy is available at https://oss.quavern.com/licences/qosl/1.0/
"""The sampler: fetch every declared GTFS-Realtime feed once and store its counts.

It runs next to a Quavsit engine and borrows three things from it: the HTTP layer
(bounded reads, the Quavsit user agent), the daily upstream budgets (every fetch
is charged to the feed's own product and to ``observatory_fetches``), and the
transit store (read-only, to know which trips, routes and stops a timetable has).
It stores counts only: never a feed body, a URL, an identifier or a position.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from . import metrics

OBSERVATORY_PRODUCT = "observatory_fetches"
OBSERVATORY_DAILY_LIMIT = 2000
PAN_PROXY_HOST = "proxy.transport.data.gouv.fr"
RATE_LIMIT_WAIT_SECONDS = 40
CONCURRENCY = 4
SCHEMA_VERSION = 1

SCHEMA = [
    "CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL)",
    """CREATE TABLE IF NOT EXISTS samples(
        id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT,
        feeds_attempted INTEGER, feeds_ok INTEGER, engine_commit TEXT)""",
    """CREATE TABLE IF NOT EXISTS feed_samples(
        sample_id INTEGER NOT NULL REFERENCES samples(id), network TEXT NOT NULL, kind TEXT NOT NULL,
        host TEXT NOT NULL, product TEXT NOT NULL, fetched_at TEXT NOT NULL, outcome TEXT NOT NULL,
        http_status INTEGER, bytes INTEGER, header_timestamp INTEGER, entity_count INTEGER, counts_json TEXT)""",
    "CREATE INDEX IF NOT EXISTS feed_samples_day ON feed_samples(network, kind, fetched_at)",
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_descriptors(directory: Path) -> dict[str, dict]:
    descriptors = {}
    for path in sorted(Path(directory).glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        descriptors[data["id"]] = data
    return descriptors


@dataclass
class Feed:
    url: str
    kind: str
    product: str
    networks: list[str] = field(default_factory=list)

    @property
    def host(self) -> str:
        return (urlsplit(self.url).hostname or "").lower()


def declared_feeds(descriptors: dict[str, dict], only: set[str] | None = None) -> list[Feed]:
    """One entry per (url, kind); a feed several networks declare is fetched once."""
    feeds: dict[tuple[str, str], Feed] = {}
    for slug, descriptor in descriptors.items():
        if only and slug not in only:
            continue
        for kind, spec in (descriptor.get("realtime") or {}).items():
            if kind not in metrics.KINDS or not isinstance(spec, dict) or not spec.get("url"):
                continue
            url = spec["url"]
            product = spec.get("product") or ("pan_proxy" if PAN_PROXY_HOST in url else "gtfs_rt_direct")
            feed = feeds.setdefault((url, kind), Feed(url=url, kind=kind, product=product))
            feed.networks.append(slug)
    return list(feeds.values())


class Timetable:
    """Read-only lookups into the transit store, one connection per thread."""

    def __init__(self, path: str):
        self.path = path
        self._local = threading.local()

    def _conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True, timeout=30)
            self._local.conn = conn
        return conn

    def ingested(self, network: str) -> bool:
        row = self._conn().execute("SELECT refreshed_at FROM network_static WHERE network = ?", (network,)).fetchone()
        return bool(row and row[0])

    def _known(self, table: str, column: str, network: str, ids) -> set:
        ids = [value for value in ids if value]
        found: set = set()
        for start in range(0, len(ids), 500):
            chunk = ids[start : start + 500]
            marks = ",".join("?" * len(chunk))
            query = f"SELECT {column} FROM {table} WHERE network = ? AND {column} IN ({marks})"
            found.update(row[0] for row in self._conn().execute(query, [network, *chunk]))
        return found

    def lookups(self, network: str) -> dict:
        if not self.ingested(network):
            return {"trips": None, "routes": None, "stops": None}
        return {
            "trips": lambda ids: self._known("gtfs_trips", "trip_id", network, ids),
            "routes": lambda ids: self._known("gtfs_routes", "route_id", network, ids),
            "stops": lambda ids: self._known("gtfs_stops_map", "gtfs_stop_id", network, ids),
        }


class Engine:
    """The pieces borrowed from the Quavsit engine on the host."""

    def __init__(self):
        from app.transit import http, settings  # noqa: PLC0415 - only present next to the engine
        from app.transit.budget import BudgetManager
        from app.transit.store import get_store

        self.http = http
        self.settings = settings
        self.budget = BudgetManager(get_store())

    @property
    def fingerprint(self) -> str:
        """SHA-256 (12 hex) of the engine's transit package as deployed, so a reading names the code that took it."""
        import app.transit as package  # noqa: PLC0415

        digest = hashlib.sha256()
        root = Path(package.__file__).resolve().parent
        for path in sorted(root.rglob("*.py")):
            digest.update(str(path.relative_to(root)).encode())
            digest.update(path.read_bytes())
        return digest.hexdigest()[:12]

    @property
    def transit_db(self) -> str:
        return str(self.settings.transit_db_path())

    @property
    def networks_dir(self) -> Path:
        return Path(self.settings.networks_dir())

    def reserve(self, product: str) -> bool:
        return self.budget.reserve(product) and self.budget.reserve(OBSERVATORY_PRODUCT, limit=OBSERVATORY_DAILY_LIMIT)

    def fetch(self, url: str) -> tuple[str, int | None, bytes]:
        """(outcome, http status, body) with one retry after 40 s on HTTP 429."""
        for attempt in (1, 2):
            try:
                response = self.http.get(
                    url,
                    timeout=self.settings.feed_timeout(),
                    retries=0,
                    raise_for_status=False,
                    source="observatory",
                )
            except self.http.UpstreamTimeout:
                return "timeout", None, b""
            except self.http.UpstreamError:
                return "connection", None, b""
            if response.status == 429 and attempt == 1:
                time.sleep(RATE_LIMIT_WAIT_SECONDS)
                continue
            if response.status == 429:
                return "rate_limited", 429, b""
            if 400 <= response.status < 500:
                return "http_4xx", response.status, b""
            if response.status >= 500:
                return "http_5xx", response.status, b""
            return "ok", response.status, response.body
        return "rate_limited", 429, b""


def open_db(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    for statement in SCHEMA:
        conn.execute(statement)
    if conn.execute("SELECT COUNT(*) FROM schema_version").fetchone()[0] == 0:
        conn.execute("INSERT INTO schema_version(version) VALUES (?)", (SCHEMA_VERSION,))
    conn.commit()
    return conn


def sample(db_path: str, *, engine: Engine | None = None, only: set[str] | None = None) -> dict:
    engine = engine or Engine()
    engine_commit = engine.fingerprint
    descriptors = load_descriptors(engine.networks_dir)
    feeds = declared_feeds(descriptors, only)
    timetable = Timetable(engine.transit_db)
    conn = open_db(db_path)
    started = utc_now()
    sample_id = conn.execute(
        "INSERT INTO samples(started_at, engine_commit) VALUES (?, ?)", (iso(started), engine_commit or None)
    ).lastrowid
    conn.commit()

    rows: list[tuple] = []
    rows_lock = threading.Lock()
    measure_lock = threading.Lock()

    def run(feed: Feed) -> None:
        fetched_at = iso(utc_now())
        if not engine.reserve(feed.product):
            outcome, status, body = "budget", None, b""
        else:
            outcome, status, body = engine.fetch(feed.url)
        for network in feed.networks:
            header, entities, counts = None, None, None
            row_outcome = outcome
            if outcome == "ok":
                try:
                    with measure_lock:
                        counts = metrics.measure(feed.kind, body, **timetable.lookups(network))
                    header, entities = counts.pop("header_timestamp"), counts.pop("entities")
                except metrics.FeedDecodeError:
                    row_outcome, counts = "decode_error", None
            with rows_lock:
                rows.append(
                    (
                        sample_id, network, feed.kind, feed.host, feed.product, fetched_at, row_outcome,
                        status, len(body), header, entities, json.dumps(counts) if counts is not None else None,
                    )
                )

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        list(pool.map(run, feeds))

    conn.executemany("INSERT INTO feed_samples VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    ok = sum(1 for row in rows if row[6] == "ok")
    conn.execute(
        "UPDATE samples SET finished_at = ?, feeds_attempted = ?, feeds_ok = ? WHERE id = ?",
        (iso(utc_now()), len(rows), ok, sample_id),
    )
    conn.commit()
    conn.close()
    return {"sample": sample_id, "feeds": len(feeds), "rows": len(rows), "ok": ok}
