# SPDX-License-Identifier: LicenseRef-QOSL-1.0
# Copyright (c) 2026 Quavern
# This file is subject to the Quavern Open Source License, version 1.0.
# A copy is available at https://oss.quavern.com/licences/qosl/1.0/
"""Counting rules of the Quavsit Observatory.

One GTFS-Realtime payload in, plain counts out. Nothing here fetches, stores or
knows about Quavsit: the timetable is reached through three lookup callables,
each taking a set of identifiers and returning the subset the network's
timetable knows. Pass ``None`` for all three when the network has no timetable;
every join is then reported as ``None``.

Rates are pairs, never percentages: ``{"n": 126, "of": 166}``.
"""

from __future__ import annotations

from typing import Callable, Iterable

from google.protobuf.message import DecodeError
from google.transit import gtfs_realtime_pb2

Lookup = Callable[[Iterable[str]], set]

KINDS = ("trip_updates", "vehicle_positions", "alerts")

# TripDescriptor.ScheduleRelationship: CANCELED = 3, DELETED = 7.
_CANCELLED = {3, 7}


class FeedDecodeError(ValueError):
    """The payload is not a GTFS-Realtime FeedMessage."""


def rate(n: int, of: int) -> dict:
    return {"n": int(n), "of": int(of)}


def _has(message, field: str) -> bool:
    try:
        return message.HasField(field)
    except ValueError:
        return False


def decode(payload: bytes) -> gtfs_realtime_pb2.FeedMessage:
    feed = gtfs_realtime_pb2.FeedMessage()
    try:
        feed.ParseFromString(payload)
    except (DecodeError, RuntimeWarning, ValueError) as error:
        raise FeedDecodeError(str(error)) from None
    if not _has(feed, "header"):
        raise FeedDecodeError("no FeedHeader")
    return feed


def header_timestamp(feed: gtfs_realtime_pb2.FeedMessage) -> int | None:
    """The feed's own timestamp in seconds, or None when it publishes none (0 counts as none)."""
    if _has(feed.header, "timestamp") and feed.header.timestamp > 0:
        return int(feed.header.timestamp)
    return None


def _join(ids: set, lookup: Lookup | None) -> dict | None:
    if lookup is None:
        return None
    known = lookup(ids) if ids else set()
    return rate(len(ids & set(known)), len(ids))


def trip_update_counts(feed, trips: Lookup | None) -> dict:
    """``trip_join`` counts runs, one per (trip_id, start_date), because repeats of a run are
    merged before anyone reads them; every other member counts entities as published."""
    runs: dict[tuple[str, str], bool] = {}
    no_trip_id = 0
    no_trip_id_cancelled = 0
    timed = 0
    stop_updates = 0
    for entity in feed.entity:
        if not _has(entity, "trip_update"):
            continue
        update = entity.trip_update
        trip = update.trip
        cancelled = _has(trip, "schedule_relationship") and trip.schedule_relationship in _CANCELLED
        trip_level_delay = _has(update, "delay")
        for stu in update.stop_time_update:
            stop_updates += 1
            arrival = stu.arrival if _has(stu, "arrival") else None
            departure = stu.departure if _has(stu, "departure") else None
            if trip_level_delay or any(
                event is not None and (_has(event, "time") or _has(event, "delay")) for event in (arrival, departure)
            ):
                timed += 1
        trip_id = trip.trip_id if _has(trip, "trip_id") else ""
        if not trip_id:
            no_trip_id += 1
            no_trip_id_cancelled += int(cancelled)
            continue
        key = (trip_id, trip.start_date if _has(trip, "start_date") else "")
        runs[key] = runs.get(key, False) or cancelled
    trip_ids = {trip_id for trip_id, _ in runs}
    joined = None
    if trips is not None:
        known = set(trips(trip_ids)) if trip_ids else set()
        joined = rate(sum(1 for trip_id, _ in runs if trip_id in known), len(runs))
    total = len(runs) + no_trip_id
    return {
        "trip_join": joined,
        "no_trip_id": no_trip_id,
        "stop_updates_timed": rate(timed, stop_updates),
        "cancelled": rate(sum(runs.values()) + no_trip_id_cancelled, total),
    }


def vehicle_counts(feed, trips: Lookup | None) -> dict:
    vehicles = 0
    positioned = 0
    with_trip_id = 0
    with_route_id = 0
    trip_ids: list[str] = []
    for entity in feed.entity:
        if not _has(entity, "vehicle"):
            continue
        vehicles += 1
        vehicle = entity.vehicle
        position = vehicle.position if _has(vehicle, "position") else None
        if position is None or not (position.latitude or position.longitude):
            continue
        positioned += 1
        trip = vehicle.trip if _has(vehicle, "trip") else None
        if trip is not None and _has(trip, "trip_id") and trip.trip_id:
            with_trip_id += 1
            trip_ids.append(trip.trip_id)
        if trip is not None and _has(trip, "route_id") and trip.route_id:
            with_route_id += 1
    joined = None
    if trips is not None:
        known = set(trips(set(trip_ids))) if trip_ids else set()
        joined = rate(sum(1 for trip_id in trip_ids if trip_id in known), len(trip_ids))
    return {
        "with_position": rate(positioned, vehicles),
        "with_trip_id": rate(with_trip_id, positioned),
        "with_route_id": rate(with_route_id, positioned),
        "trip_join": joined,
    }


def alert_counts(feed, routes: Lookup | None, stops: Lookup | None) -> dict:
    named: list[tuple[str, str]] = []
    for entity in feed.entity:
        if not _has(entity, "alert"):
            continue
        for selector in entity.alert.informed_entity:
            route_id = selector.route_id if _has(selector, "route_id") else ""
            stop_id = selector.stop_id if _has(selector, "stop_id") else ""
            if route_id or stop_id:
                named.append((route_id, stop_id))
    if routes is None or stops is None:
        return {"informed_resolved": None}
    known_routes = set(routes({r for r, _ in named if r})) if any(r for r, _ in named) else set()
    known_stops = set(stops({s for _, s in named if s})) if any(s for _, s in named) else set()
    resolved = sum(1 for r, s in named if (r and r in known_routes) or (s and s in known_stops))
    return {"informed_resolved": rate(resolved, len(named))}


def measure(
    kind: str,
    payload: bytes,
    *,
    trips: Lookup | None = None,
    routes: Lookup | None = None,
    stops: Lookup | None = None,
) -> dict:
    """Decode one payload of ``kind`` and return its counts.

    Raises ``FeedDecodeError`` when the payload is not a FeedMessage. The result always
    carries ``header_timestamp`` (seconds or None) and ``entities`` (every entity in the
    message, whatever it holds).
    """
    if kind not in KINDS:
        raise ValueError(f"unknown feed kind {kind!r}")
    feed = decode(payload)
    counts = {"header_timestamp": header_timestamp(feed), "entities": len(feed.entity)}
    if kind == "trip_updates":
        counts.update(trip_update_counts(feed, trips))
    elif kind == "vehicle_positions":
        counts.update(vehicle_counts(feed, trips))
    else:
        counts.update(alert_counts(feed, routes, stops))
    return counts
