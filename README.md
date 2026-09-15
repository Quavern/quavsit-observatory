# Quavsit Observatory

A dated daily record of what the public-transport data of 147 French networks is worth when an engine reads it: when each timetable ends, whether each real-time feed answers, and how much of its data matches the timetable.

**Pages:** https://oss.quavern.com/quavsit-observatory/ (English) · https://oss.quavern.com/quavsit-observatory/fr/ (français)
**Method:** [`methodology/en.md`](methodology/en.md) · [`methodology/fr.md`](methodology/fr.md)

Trial period since 15 September 2026: the counting rules may still change, and a change republishes the days it affects (`CORRECTIONS.md`).

## What is here

| Path | What it is |
| --- | --- |
| `observatory/metrics.py` | The counting rules: one GTFS-Realtime payload in, counts out. No I/O. |
| `observatory/collector.py` | The sampler. Runs next to the Quavsit engine, borrows its HTTP layer, upstream budgets and read-only transit store, and stores counts only. |
| `observatory/publish.py` | Aggregates a UTC day, redacts, validates, writes the data files and exports them as `https://dl.quavern.net/observatory/data.tar.gz` with its SHA-256. |
| `data/` | Published measurements (CC BY 4.0), written by the collector only. |
| `schema/observatory-1.json` | JSON Schema of a day file. |
| `site/` | Page generator (`node site/build.mjs`), no dependency. |
| `deploy/` | systemd units and the install script for the Quavsit host. |

The collector imports `app.transit` from the Quavsit engine, which is not open source; the rules it applies and every file it writes are here.

## Develop

```sh
pip install -r requirements-dev.txt
python -m pytest -q
node site/build.mjs          # needs data/latest.json
```

## Run on the Quavsit host

```sh
sudo deploy/install.sh
sudo systemctl enable --now quavsit-observatory-sample.timer \
  quavsit-observatory-publish-today.timer quavsit-observatory-publish-yesterday.timer
```

Samples at 02:40, 05:40 … 23:40 UTC; the day so far is exported at :55 after each sample, and the finished day at 00:25 UTC. `.github/workflows/sync-data.yml` pulls the archive a few minutes later, checks its SHA-256, commits `data/` and publishes the pages. The host holds no GitHub credential and the units load no secret: the Observatory needs no key.

## Licences

Code under the Quavern Open Source License 1.0 (draft under legal review); measurements and methodology under CC BY 4.0; see `LICENSE.md`. Corrections: open a *Correction* issue or write to hello@quavern.com.
