# How the Observatory measures

The Quavsit Observatory records, every day, what the public-transport data of 147 French networks is worth when an engine reads it. The engine is Quavsit's own; the counting rules are in `observatory/metrics.py`, in this repository, and the job that runs them is in `observatory/collector.py` and `observatory/publish.py`.

**Trial period.** Publication started on 15 September 2026. Until the trial ends, the counting rules may still change; when they do, the affected days are published again and the change is written in `CORRECTIONS.md`.

## What is sampled

- Every GTFS-Realtime feed that a Quavsit network descriptor declares: trip updates, vehicle positions and alerts.
- Eight samples a day, at 02:40, 05:40, 08:40, 11:40, 14:40, 17:40, 20:40 and 23:40 UTC. Each sample fetches each feed once. A feed that several networks declare is fetched once and counted for each of them.
- A day is a UTC date. Rates count only the samples taken between 06:00 and 22:00 in the network's own time zone; a feed that is empty at night is not a failure. Night samples are counted apart, as `samples_night`.
- Products that need a contract or a personal key (Île-de-France Mobilités PRIM, SNCF navitia, TBM XtraData, the Tisséo API, STAR's quota-bound open data) are never sampled. For those networks the page shows when the engine itself last reached each source, labelled as the engine's own traffic.
- Each fetch is charged to the daily budget Quavsit keeps for that upstream, and to a separate ceiling of 2,000 Observatory fetches a day, so the Observatory never takes capacity from Quavsit's users.

## What is counted

Every rate is two numbers, `n` of `of`. A rate whose `of` is 0 means there was nothing to measure and is shown as "—". A day's rate is the sum over its daytime samples, not an average of percentages.

**Trip updates**

- `trip_join`: runs whose `trip_id` exists in the network's timetable, of runs that carry a `trip_id`. A run is one `(trip_id, start_date)`; repeats of a run in the same message count once.
- `no_trip_id`: trip-update entities with no `trip_id`.
- `stop_updates_timed`: stop-time updates that carry a time or a delay (or whose trip carries a delay), of all stop-time updates.
- `cancelled`: runs marked `CANCELED` or `DELETED`, of all runs and entities without a `trip_id`.

**Vehicle positions**

- `with_position`: vehicle entities with a latitude and longitude, of all vehicle entities.
- `with_trip_id` and `with_route_id`: positioned vehicles that name a trip, or a line, of positioned vehicles.
- `trip_join`: vehicles whose `trip_id` exists in the timetable, of vehicles with a `trip_id`.

**Alerts**

- `informed_resolved`: informed entities whose route or stop exists in the timetable, of informed entities that name a route or a stop.

**For every feed**

- `samples`, `ok` (HTTP 200 and a valid FeedMessage), and failures: `timeout`, `connection`, `http_4xx`, `http_5xx`, `decode_error`, `budget`. An HTTP 429 is retried once after 40 seconds; a second 429 is counted as `rate_limited`, apart from failures.
- `header_age_seconds`: the median of fetch time minus the feed's own header timestamp. `no_header_timestamp` counts the answers without one.
- `entities`: the median number of entities in a message.

**Timetable**

- `timetable_ends_on`: the last day the published timetable covers, from its calendar and its added service dates. `days_left` counts from the day of the record.
- `state`: `ok`, `error` (the last refresh failed and older data is still served) or `never_ingested`.
- `refreshed_at` and `age_hours`: when Quavsit last loaded a changed timetable. A timetable that did not change keeps that date.
- `checked_at` and `check_age_hours`: when Quavsit last checked the source and found it current (Quavsit checks each timetable at least once a day).
- `source`: `operator`, or `transport_data_gouv_fr_copy` when the operator's server does not answer Quavsit's host and the timetable was taken from the copy transport.data.gouv.fr keeps of that same file.
- Counts of lines, stops, trips and stop times as loaded.

## Reading a low figure

A low join rate can come from the feed, from the timetable in use, or from Quavsit's matching. The Observatory measures one engine at one version: each day names the code it ran (`engine.code_sha256`, a hash of the engine's transit package). It is not a certification, a score or a ranking, and there is none on these pages.

Some feeds are known to cover part of a network only (for example Astuce's real-time data covers the TCAR sub-network), or to be shared by several networks (the Marseille alert feed is metropolitan). They are measured as published.

## What is never published

Feed URLs (some carry operator keys), error texts, identifiers of trips, stops or vehicles, positions, alert texts, quota figures. A feed is named by its host, and a timetable by its transport.data.gouv.fr dataset.

## Files and licences

- `data/days/YYYY-MM-DD.json`: one file per day; `data/latest.json`: the most recent day.
- `data/networks/<network>.json`: a network's last 90 days.
- `data/history.csv`: one row per day, network, feed kind and metric.

The measurements are published under the Creative Commons Attribution 4.0 licence (CC BY 4.0): credit "Quavsit Observatory". The feeds they describe are published by their operators under their own licences (ODbL, Licence Ouverte 2.0 and others), named on each network page. The code is under the Quavern Open Source License, version 1.0.

## Corrections

If a figure is wrong, open a correction on GitHub or write to hello@quavern.com with the network, the day and the metric. An accepted correction republishes the affected days and is listed in `CORRECTIONS.md`.
