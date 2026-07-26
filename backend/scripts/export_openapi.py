#!/usr/bin/env python3
"""Dump the OpenAPI schema to stdout.

Generated from the app object rather than by curling a running server, so
`make types` works from a cold clone with no processes started and no port
guessing. Also means CI can check the committed client is current.

Usage: uv run python scripts/export_openapi.py > openapi.json
"""

from __future__ import annotations

import json
import sys

from app.main import create_app


def main() -> int:
    json.dump(create_app().openapi(), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
