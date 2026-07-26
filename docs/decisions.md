# Architecture Decision Log

One entry per non-obvious choice, written **as the choice is made**. This is the interview script:
every entry should answer "why did you do it that way?" before it is asked.

Format: context → decision → consequences (including what we gave up).

---

## ADR-001 · Monorepo with `frontend/` + `backend/` + `e2e/`

**Date:** 2026-07-26 · **Task:** T-01.1 · **Status:** Accepted

**Context.** The frontend, backend and E2E suite are three separate toolchains (npm, uv, npm) that
must version together. Splitting them across repos means a schema change and its client update land
in two PRs that can merge independently.

**Decision.** One repository, three top-level projects, each owning its own dependency manifest.
`e2e/` gets its own `package.json` so Playwright's deps never leak into the app bundle.

**Consequences.** CI needs per-directory caching and path filters. In exchange, any single commit is
a coherent, runnable state — which is what makes "clone and run in two commands" achievable at all.

---

## ADR-002 · Tailwind pinned to v3, not v4

**Date:** 2026-07-26 · **Task:** T-01.6 · **Status:** Accepted

**Context.** npm currently ships Tailwind **4.3.3**, which is CSS-first: no `tailwind.config.ts` is
generated, theming happens in an `@theme` block. The plan's token-enforcement mechanism (T-01.6) is
written against a v3 config file, where replacing `theme.colors` wholesale deletes the default
palette and makes `bg-blue-500` a build error.

**Decision.** Install `tailwindcss@3` explicitly rather than `@latest`.

**Consequences.** We forgo v4's faster engine and CSS-first ergonomics. In return the single
highest-leverage discipline in the project — *no hex code outside `tokens.css`* — is enforced by the
compiler on a well-trodden path, on day one, instead of being re-derived against a newer API. The
token layer is what the UI grade rests on; it is the wrong place to spend novelty budget.

---

## ADR-003 · `uv` for Python dependency management

**Date:** 2026-07-26 · **Task:** T-01.4 · **Status:** Accepted

**Context.** The plan allows `uv` or `poetry`. Poetry is not installed locally; uv is.

**Decision.** `uv` with a PEP 621 `pyproject.toml` and a committed `uv.lock`.

**Consequences.** Resolution and installs are fast enough that CI does not need aggressive caching
to stay quick, and the lockfile makes the Docker build reproducible. `uv` is newer than poetry, so
anyone cloning this needs it installed — the README says so, and the Docker path avoids it entirely.

---

## ADR-004 · Layering enforced by a check script, not by a linter rule

**Date:** 2026-07-26 · **Task:** T-01.7 · **Status:** Accepted

**Context.** The rule that matters most on the backend is *routers must not touch the ORM* — no
`db.query(...)`, no `session.execute(...)` inside `api/v1/routers/`. Ruff has no rule that expresses
"this symbol is banned in this directory only", and writing a ruff plugin is disproportionate.

**Decision.** A small `scripts/check_layering.py` that greps the router package for ORM access and
exits non-zero, wired into `make lint`, the pre-commit hook, and CI. It is also covered by a pytest
test so it fails the backend suite too.

**Consequences.** One more moving part than a pure linter config, but the rule is readable in ten
lines, produces a targeted error message naming the offending file and line, and is trivially
extensible to the other layering invariants (e.g. schemas never importing models).

---

## ADR-006 · Off-palette colour is enforced by a lint rule, not by the compiler

**Date:** 2026-07-26 · **Task:** T-01.6 (test T01-C) · **Status:** Accepted

**Context.** The plan states that deleting Tailwind's default palette makes `bg-blue-500` "a compile
error". It does not. Tailwind emits no CSS for an unknown utility and says nothing — the class sits
in the markup doing nothing, so the colour bug ships silently and *looks* like the token system is
working. The mechanism the plan is reaching for needs an actual checker.

**Decision.** `eslint-plugin-tailwindcss`'s `no-custom-classname` rule, which errors on any class the
Tailwind config cannot produce. Verified: `bg-blue-500`, `text-white`, `text-gray-700` and
`rounded-xl` all fail; `bg-surface-0` and `text-accent` pass.

**Consequences.** The guard is broader than colour — off-scale radii and type sizes fail too, which
is what we want. Two costs. First, it pins us to the `eslint-plugin-tailwindcss@3` line, since v4 of
the plugin requires Tailwind v4. Second, hand-authored utilities (`.tnum`) are invisible to the
plugin and must be whitelisted in the ESLint config, so adding a custom utility is now a two-file
change. The plugin also needs an **absolute** path to `tailwind.config.ts` — it derives its module
resolution base from `dirname(config)`, and a relative path yields `"."`, which fails to resolve
Tailwind itself.

---

## ADR-007 · Two Tailwind internals still emit raw hex; one is accepted

**Date:** 2026-07-26 · **Task:** T-01.6 · **Status:** Accepted

**Context.** Deleting the default palette causes some of Tailwind's own internals to fall through to
hardcoded literals, because they look up palette entries that no longer exist. An audit of the built
CSS found two:

- `--tw-ring-color: #93c5fd80`. `ringColor.DEFAULT` is piped through `withAlphaValue()`, which cannot
  parse a CSS variable and therefore returns its hardcoded blue-300 fallback. **Fixed** by declaring
  `ringColor.DEFAULT` as a *function* — the resolver invokes function values directly instead of
  parsing them. Tailwind's published types declare colour leaves as `string`, so this needs a cast.
- `::placeholder { color: #9ca3af }` from preflight, which reads `colors.gray.400` directly.
  **Not fixable** without dropping preflight and hand-writing the reset.

**Decision.** Fix the ring colour. For the placeholder, override it in `globals.css` with
`--ff-text-muted` so the rendered colour is correct, and accept that preflight's literal remains in
the vendor portion of the bundle.

**Consequences.** Every colour the app actually renders traces to `tokens.css`. One inert vendor
literal survives in the output. This defines what T02-D can assert: grep **source** files other than
`tokens.css` for hex — that is the meaningful enforcement — rather than grepping the built bundle,
which necessarily contains `tokens.css` inlined plus this one vendor value.

---

## ADR-008 · `httpx2` replaces `httpx`

**Date:** 2026-07-26 · **Task:** T-01.4 · **Status:** Accepted

**Context.** The plan lists `httpx` as a backend dependency. Starlette 1.3 now emits
`StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2
instead` when `TestClient` is constructed. Because `filterwarnings = ["error"]` is set in the pytest
config — deliberately, so a deprecation cannot rot quietly for weeks — that warning failed the entire
suite at collection time.

**Decision.** Depend on `httpx2` and drop `httpx`. One HTTP client serves both `TestClient` and the
outbound LLM calls in T-29.

**Consequences.** The dependency list diverges from PLAN.md T-01.4, which was written before the
rename. Nothing else changes: `httpx2` is the same library's next major line under a new
distribution name. Keeping `filterwarnings = ["error"]` means the next such deprecation surfaces the
same way — as a failing build on the day it appears, rather than as a surprise during a later
upgrade.

---

## ADR-005 · Frontend consumes the API over HTTP from the browser, not via RSC

*(Placeholder — to be written during T-06 when the data layer lands.)*

The plan mandates TanStack Query, URL-as-state and optimistic mutations, which makes nearly every
page a client component and leaves App Router's server rendering largely unused. That is a
defensible trade — cache invalidation across the notebook/drawer/notepad surfaces is the hard part
of this app, and Query solves it — but it needs writing down, because "why App Router if everything
is `"use client"`?" is the obvious interview question.

---

## Pending decisions

Tracked so they are not silently defaulted. Each becomes an ADR when settled.

| # | Decision | Settle by |
|---|---|---|
| 1 | Speaker colour authority: DB `speakers.color_index` vs client `getSpeakerColor()` hash | T-03 |
| 2 | FTS5 rows survive a meeting's soft delete — global search must filter `deleted_at IS NULL` | T-03.9 |
| 3 | Who composes the five summary sections (API vs frontend), given action items are a separate table | T-17.7 |
| 4 | Whether `/` becomes a real welcome screen or Home is dropped from the nav (it can never be active while `/` redirects) | T-07 |
| 5 | Filters panel: draft-then-Apply vs live-apply (T-13.5 offers both; pick one, be consistent) | T-13 |
