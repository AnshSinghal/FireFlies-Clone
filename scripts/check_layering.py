#!/usr/bin/env python3
"""Enforce the backend layering rule: routers must not touch the ORM.

A router's job is parse the request -> call a service -> return a schema. The
moment it reaches for `db.query(...)` the business logic starts living in the
HTTP layer, where it cannot be reused or unit-tested, and where the plan says
"Backend / API Design" marks go to die.

Ruff has no rule that expresses "this symbol is banned in this directory only",
so this is a small AST walk instead of a grep — grep would flag the string
`db.query` inside a docstring and miss `getattr(db, "query")`, and it cannot
tell an import of `select` apart from a variable of the same name.

Run: python scripts/check_layering.py [backend_dir]
Exit: 0 clean, 1 on any violation.
"""

from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

# Import roots a router may never pull in.
BANNED_IMPORT_PREFIXES = ("sqlalchemy", "app.models", "app.db")

# Method names that mean "I am talking to a session".
BANNED_METHODS = frozenset({"query", "execute", "scalars", "scalar", "add", "commit", "flush"})


@dataclass(frozen=True)
class Violation:
    path: Path
    line: int
    detail: str

    def render(self, root: Path) -> str:
        rel = self.path.relative_to(root) if self.path.is_relative_to(root) else self.path
        return f"  {rel}:{self.line}  {self.detail}"


class RouterVisitor(ast.NodeVisitor):
    """Collects ORM access within a single router module."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.violations: list[Violation] = []
        # Names bound to a session-like object, e.g. `db: Session = Depends(get_db)`.
        self._session_names: set[str] = {"db", "session"}

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            if alias.name.startswith(BANNED_IMPORT_PREFIXES):
                self._flag(node.lineno, f"imports {alias.name!r} — routers must not reach the ORM")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        if module.startswith(BANNED_IMPORT_PREFIXES):
            names = ", ".join(alias.name for alias in node.names)
            self._flag(node.lineno, f"imports {names} from {module!r} — call a service instead")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        if (
            isinstance(func, ast.Attribute)
            and func.attr in BANNED_METHODS
            and isinstance(func.value, ast.Name)
            and func.value.id in self._session_names
        ):
            self._flag(
                node.lineno,
                f"calls {func.value.id}.{func.attr}() — move this into app/services/",
            )
        self.generic_visit(node)

    def _flag(self, line: int, detail: str) -> None:
        self.violations.append(Violation(self.path, line, detail))


def check(backend_dir: Path) -> list[Violation]:
    routers = backend_dir / "app" / "api"
    if not routers.is_dir():
        return []

    violations: list[Violation] = []
    for path in sorted(routers.rglob("*.py")):
        visitor = RouterVisitor(path)
        visitor.visit(ast.parse(path.read_text(encoding="utf-8"), filename=str(path)))
        violations.extend(visitor.violations)
    return violations


def main() -> int:
    default = Path(__file__).resolve().parents[1] / "backend"
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else default
    root = root.resolve()

    violations = check(root)
    if not violations:
        print("layering: routers are clean (no ORM access)")
        return 0

    print(f"layering: {len(violations)} violation(s) — routers must not touch the ORM\n")
    for violation in violations:
        print(violation.render(root))
    print("\nA router parses the request, calls a service, and returns a schema. Nothing else.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
