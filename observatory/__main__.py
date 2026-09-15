# SPDX-License-Identifier: LicenseRef-QOSL-1.0
# Copyright (c) 2026 Quavern
# This file is subject to the Quavern Open Source License, version 1.0.
# A copy is available at https://oss.quavern.com/licences/qosl/1.0/
"""python -m observatory sample | publish --day YYYY-MM-DD|today|yesterday"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, timedelta
from pathlib import Path

from .collector import utc_now


def main() -> None:
    parser = argparse.ArgumentParser(prog="observatory")
    sub = parser.add_subparsers(dest="command", required=True)
    sample = sub.add_parser("sample", help="fetch every declared feed once and store its counts")
    sample.add_argument("--only", help="comma-separated network slugs")
    publish = sub.add_parser("publish", help="write a day's files and export data.tar.gz for the repository to pull")
    publish.add_argument("--day", default="yesterday")
    publish.add_argument("--no-export", action="store_true")
    args = parser.parse_args()

    db_path = os.environ.get("QUAVSIT_OBSERVATORY_DB", "/var/lib/quavsit/observatory.db")
    if args.command == "sample":
        from .collector import sample as run_sample

        only = set(args.only.split(",")) if args.only else None
        result = run_sample(db_path, only=only)
    else:
        from .collector import Engine
        from .publish import publish as run_publish

        today = utc_now().date()
        day = {"today": today, "yesterday": today - timedelta(days=1)}.get(args.day) or date.fromisoformat(args.day)
        engine = Engine()
        repo = Path(os.environ.get("QUAVSIT_OBSERVATORY_DATA", "/var/lib/quavsit/observatory-data"))
        target = None if args.no_export else Path(os.environ.get("QUAVSIT_OBSERVATORY_EXPORT", "/var/www/dl/observatory"))
        result = run_publish(db_path, engine.transit_db, engine.networks_dir, repo, day, export_to=target)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
