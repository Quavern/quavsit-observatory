# SPDX-License-Identifier: LicenseRef-QOSL-1.0
# Copyright (c) 2026 Quavern
# This file is subject to the Quavern Open Source License, version 1.0.
# A copy is available at https://oss.quavern.com/licences/qosl/1.0/
import json
from pathlib import Path

import pytest

jsonschema = pytest.importorskip("jsonschema")
ROOT = Path(__file__).resolve().parents[1]


def test_every_day_file_matches_the_schema():
    validator = jsonschema.Draft202012Validator(json.loads((ROOT / "schema/observatory-1.json").read_text()))
    days = sorted((ROOT / "data/days").glob("*.json"))
    for path in days:
        validator.validate(json.loads(path.read_text()))
