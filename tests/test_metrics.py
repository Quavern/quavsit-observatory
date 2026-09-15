# SPDX-License-Identifier: LicenseRef-QOSL-1.0
# Copyright (c) 2026 Quavern
# This file is subject to the Quavern Open Source License, version 1.0.
# A copy is available at https://oss.quavern.com/licences/qosl/1.0/
import pytest
from google.transit import gtfs_realtime_pb2 as pb

from observatory import metrics


def feed(timestamp=1_700_000_000):
    message = pb.FeedMessage()
    message.header.gtfs_realtime_version = "2.0"
    if timestamp is not None:
        message.header.timestamp = timestamp
    return message


def known(*ids):
    return lambda asked: set(asked) & set(ids)


def test_trip_updates_count_runs_entities_and_timed_stop_updates():
    message = feed()
    a = message.entity.add(id="1").trip_update
    a.trip.trip_id, a.trip.start_date = "T1", "20260915"
    a.stop_time_update.add(stop_sequence=1).arrival.delay = 60
    a.stop_time_update.add(stop_sequence=2)  # neither time nor delay
    repeat = message.entity.add(id="2").trip_update  # same run, merged
    repeat.trip.trip_id, repeat.trip.start_date = "T1", "20260915"
    b = message.entity.add(id="3").trip_update
    b.trip.trip_id = "UNKNOWN"
    b.trip.schedule_relationship = pb.TripDescriptor.CANCELED
    c = message.entity.add(id="4").trip_update
    c.trip.route_id = "R1"  # no trip_id
    c.delay = 30
    c.stop_time_update.add(stop_sequence=1)

    counts = metrics.measure("trip_updates", message.SerializeToString(), trips=known("T1"))

    assert counts["entities"] == 4
    assert counts["header_timestamp"] == 1_700_000_000
    assert counts["trip_join"] == {"n": 1, "of": 2}
    assert counts["no_trip_id"] == 1
    assert counts["stop_updates_timed"] == {"n": 2, "of": 3}
    assert counts["cancelled"] == {"n": 1, "of": 3}


def test_vehicles_without_position_or_route():
    message = feed(timestamp=None)
    v1 = message.entity.add(id="1").vehicle
    v1.position.latitude, v1.position.longitude = 43.6, 3.9
    v1.trip.trip_id = "T1"
    v2 = message.entity.add(id="2").vehicle
    v2.position.latitude, v2.position.longitude = 43.6, 3.8
    v2.trip.route_id = "R1"
    message.entity.add(id="3").vehicle.vehicle.id = "no-position"

    counts = metrics.measure("vehicle_positions", message.SerializeToString(), trips=known("X"))

    assert counts["header_timestamp"] is None
    assert counts["with_position"] == {"n": 2, "of": 3}
    assert counts["with_trip_id"] == {"n": 1, "of": 2}
    assert counts["with_route_id"] == {"n": 1, "of": 2}
    assert counts["trip_join"] == {"n": 0, "of": 1}


def test_alerts_resolve_routes_or_stops_and_null_without_timetable():
    message = feed()
    alert = message.entity.add(id="1").alert
    alert.informed_entity.add(route_id="R1")
    alert.informed_entity.add(stop_id="S9")
    alert.informed_entity.add(agency_id="A")  # names neither: not counted
    payload = message.SerializeToString()

    assert metrics.measure("alerts", payload, routes=known("R1"), stops=known())["informed_resolved"] == {"n": 1, "of": 2}
    assert metrics.measure("alerts", payload)["informed_resolved"] is None


def test_no_timetable_reports_null_joins():
    message = feed()
    message.entity.add(id="1").trip_update.trip.trip_id = "T1"
    counts = metrics.measure("trip_updates", message.SerializeToString())
    assert counts["trip_join"] is None
    assert counts["cancelled"] == {"n": 0, "of": 1}


def test_garbage_is_a_decode_error():
    with pytest.raises(metrics.FeedDecodeError):
        metrics.measure("alerts", b"<html>not a feed</html>")
