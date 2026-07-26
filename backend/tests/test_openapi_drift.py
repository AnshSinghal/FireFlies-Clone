"""The committed OpenAPI schema must match the running app.

`docs/openapi.json` is the input to the generated TypeScript client
(`frontend/src/types/api.d.ts`). The promise of that codegen — a backend field
rename becomes a frontend type ERROR rather than a runtime `undefined` — only
holds while the committed schema is current.

Nothing forces `make types` to be re-run after changing an endpoint, so this
test does. It fails with the exact instruction rather than leaving someone to
wonder why the frontend types disagree with the API.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.main import create_app

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"


def test_committed_schema_is_current() -> None:
    assert SCHEMA_PATH.exists(), f"missing {SCHEMA_PATH}; run `make types`"

    committed = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    current = json.loads(json.dumps(create_app().openapi(), sort_keys=True))

    if committed != current:
        added = sorted(set(current["paths"]) - set(committed["paths"]))
        removed = sorted(set(committed["paths"]) - set(current["paths"]))
        hint = ""
        if added:
            hint += f"\n  added:   {', '.join(added)}"
        if removed:
            hint += f"\n  removed: {', '.join(removed)}"

        raise AssertionError(
            "docs/openapi.json is stale — the TypeScript client no longer matches "
            f"the API.{hint}\n\nRun `make types` and commit the result."
        )
