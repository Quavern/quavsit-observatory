# SPDX-License-Identifier: LicenseRef-QOSL-1.0
# Copyright (c) 2026 Quavern
# This file is subject to the Quavern Open Source License, version 1.0.
# A copy is available at https://oss.quavern.com/licences/qosl/1.0/
import json
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from observatory import collector, publish


def test_error_reason_keeps_the_host_and_drops_the_text():
    text = "tlp:gtfs:static: UpstreamTimeout: archive:https://feeds.example.org/s/SECRETTOKEN/download#: timeout after 60s"
    assert publish.error_reason(text) == {"reason": "timeout", "host": "feeds.example.org"}
    assert publish.error_reason("HTTP 406") == {"reason": "http_4xx", "host": None}
    assert publish.error_reason(None) is None


def row(fetched_at, outcome="ok", header=None, entities=10, counts=None):
    return {
        "host": "feeds.example.org",
        "fetched_at": fetched_at,
        "outcome": outcome,
        "header_timestamp": header,
        "entity_count": entities,
        "counts_json": json.dumps(counts) if counts is not None else None,
    }


def test_realtime_block_sums_daytime_rates_and_keeps_night_apart():
    paris = ZoneInfo("Europe/Paris")
    rows = [
        row("2026-09-15T08:40:00Z", header=int(datetime(2026, 9, 15, 8, 39, 30, tzinfo=timezone.utc).timestamp()),
            counts={"trip_join": {"n": 8, "of": 10}, "stop_updates_timed": {"n": 5, "of": 5}, "cancelled": {"n": 0, "of": 10}, "no_trip_id": 1}),
        row("2026-09-15T11:40:00Z", counts={"trip_join": {"n": 2, "of": 10}, "stop_updates_timed": {"n": 0, "of": 5}, "cancelled": {"n": 1, "of": 10}, "no_trip_id": 0}),
        row("2026-09-15T14:40:00Z", outcome="timeout", entities=None),
        row("2026-09-15T17:40:00Z", outcome="rate_limited", entities=None),
        row("2026-09-15T23:40:00Z", counts={"trip_join": {"n": 0, "of": 99}, "stop_updates_timed": {"n": 0, "of": 0}, "cancelled": {"n": 0, "of": 0}, "no_trip_id": 0}),
    ]
    block = publish.realtime_block(rows, "trip_updates", paris)
    assert block["samples"] == 4 and block["samples_night"] == 1
    assert block["ok"] == 2 and block["failures"]["timeout"] == 1 and block["rate_limited"] == 1
    assert block["trip_join"] == {"n": 10, "of": 20}
    assert block["no_trip_id"] == 1
    assert block["header_age_seconds"] == 30 and block["no_header_timestamp"] == 1


def test_validate_rejects_a_url_and_an_impossible_rate():
    document = {"schema": publish.SCHEMA_ID, "day": "2026-09-15", "networks": [
        {"network": "x", "static": {"state": "ok"}, "realtime": {"alerts": {
            "samples": 1, "ok": 1, "rate_limited": 0, "failures": {k: 0 for k in publish.FAILURES},
            "informed_resolved": {"n": 3, "of": 2}, "note": "https://feeds.example.org/?apikey=1"}}}]}
    problems = publish.validate_day(document)
    assert "a URL appears in the day file" in problems
    assert "x.alerts.informed_resolved" in problems


def test_build_day_on_a_tiny_store(tmp_path: Path):
    transit = sqlite3.connect(tmp_path / "transit.db")
    transit.executescript(
        """
        CREATE TABLE network_static(network TEXT PRIMARY KEY, refreshed_at TEXT, source_url TEXT, etag TEXT, last_modified TEXT, stats_json TEXT, error TEXT);
        CREATE TABLE gtfs_calendar(network TEXT, service_id TEXT, monday INTEGER, tuesday INTEGER, wednesday INTEGER, thursday INTEGER, friday INTEGER, saturday INTEGER, sunday INTEGER, start_date TEXT, end_date TEXT);
        CREATE TABLE gtfs_calendar_dates(network TEXT, service_id TEXT, date TEXT, exception_type INTEGER);
        CREATE TABLE upstream_status(product TEXT PRIMARY KEY, last_ok_at TEXT, last_error_at TEXT, last_error TEXT);
        INSERT INTO network_static VALUES ('tam', '2026-09-15T06:00:00+00:00', 'https://secret.example.org/?key=1', NULL, NULL, '{"rows_lines": 19}', NULL);
        INSERT INTO gtfs_calendar VALUES ('tam', 'S', 1,1,1,1,1,0,0, '20260901', '20261016');
        INSERT INTO gtfs_calendar_dates VALUES ('tam', 'S', '20261020', 1);
        """
    )
    db = collector.open_db(str(tmp_path / "observatory.db"))
    db.execute("INSERT INTO samples(id, started_at, finished_at) VALUES (1, '2026-09-15T08:40:00Z', '2026-09-15T08:41:00Z')")
    db.execute(
        "INSERT INTO feed_samples VALUES (1, 'tam', 'alerts', 'data.example.org', 'gtfs_rt_direct', '2026-09-15T08:40:05Z', 'ok', 200, 10, NULL, 3, ?)",
        (json.dumps({"informed_resolved": {"n": 1, "of": 1}}),),
    )
    db.commit()
    descriptors = {"tam": {"id": "tam", "name": "TaM", "city": "Montpellier", "region": "Occitanie", "timezone": "Europe/Paris",
                           "static": {"kind": "gtfs", "pan_dataset_slug": "tam"}, "realtime": {"alerts": {"url": "https://data.example.org/a.pb?key=1"}}}}
    now = datetime(2026, 9, 16, 0, 25, tzinfo=timezone.utc)
    document = publish.build_day(db, transit, descriptors, date(2026, 9, 15), now)
    network = document["networks"][0]
    assert document["complete"] is True
    assert network["static"]["timetable_ends_on"] == "2026-10-20" and network["static"]["days_left"] == 35
    assert network["realtime"]["alerts"]["informed_resolved"] == {"n": 1, "of": 1}
    assert publish.validate_day(document) == []
    assert "example.org/" not in json.dumps(document)
