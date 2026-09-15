# Contributing

- **A figure is wrong:** open a *Correction* issue (network, day, metric, evidence), or write to hello@quavern.com.
- **The counting rules:** a pull request to `observatory/metrics.py` must come with a test in `tests/test_metrics.py` and a line in `methodology/en.md` and `methodology/fr.md`.
- **The pages:** `node site/build.mjs` builds them from `data/`; check a narrow and a wide width before opening a pull request.
- **Data files** are written by the collector only; pull requests that edit `data/` by hand are not merged.

Run `pip install -r requirements-dev.txt && python -m pytest -q`. A contribution is received under the repository's licence (QOSL-1.0, section 2.5). Issues and pull requests are read; there is no guaranteed reply delay.
