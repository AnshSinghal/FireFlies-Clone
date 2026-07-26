"""Layering guard (T-01.7, test case T01-D).

Two assertions, and the second matters as much as the first: a checker nobody
has ever seen fail is not evidence of anything. So we prove the real routers are
clean *and* that the checker rejects a router that reaches for the ORM.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
CHECKER_PATH = BACKEND_DIR.parent / "scripts" / "check_layering.py"


def _load_checker() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_layering", CHECKER_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["check_layering"] = module
    spec.loader.exec_module(module)
    return module


checker = _load_checker()


def test_routers_do_not_touch_the_orm() -> None:
    violations = checker.check(BACKEND_DIR)
    rendered = "\n".join(v.render(BACKEND_DIR) for v in violations)
    assert not violations, f"routers reached for the ORM:\n{rendered}"


@pytest.mark.parametrize(
    ("source", "expected_fragment"),
    [
        pytest.param(
            "def list_meetings(db):\n    return db.query(Meeting).all()\n",
            "db.query()",
            id="session-query",
        ),
        pytest.param(
            "from sqlalchemy import select\n",
            "sqlalchemy",
            id="sqlalchemy-import",
        ),
        pytest.param(
            "from app.models.meeting import Meeting\n",
            "app.models.meeting",
            id="model-import",
        ),
        pytest.param(
            "def get(db):\n    return db.execute('SELECT 1')\n",
            "db.execute()",
            id="session-execute",
        ),
    ],
)
def test_checker_catches_orm_access(tmp_path: Path, source: str, expected_fragment: str) -> None:
    routers = tmp_path / "app" / "api" / "v1" / "routers"
    routers.mkdir(parents=True)
    (routers / "offending.py").write_text(source, encoding="utf-8")

    violations = checker.check(tmp_path)

    assert violations, f"checker missed: {source!r}"
    assert any(expected_fragment in v.detail for v in violations)


def test_checker_allows_a_well_behaved_router(tmp_path: Path) -> None:
    routers = tmp_path / "app" / "api" / "v1" / "routers"
    routers.mkdir(parents=True)
    (routers / "meetings.py").write_text(
        "from app.services.meetings import MeetingService\n"
        "\n"
        "def list_meetings(service: MeetingService):\n"
        "    return service.list()\n",
        encoding="utf-8",
    )

    assert checker.check(tmp_path) == []
