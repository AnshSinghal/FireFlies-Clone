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

## ADR-009 · `NoDecode` on every list-typed setting

**Date:** 2026-07-26 · **Task:** T-01.5 · **Status:** Accepted

**Context.** `CORS_ORIGINS=http://localhost:3100` crashed the app at import time with
`error parsing value for field "cors_origins"`. For complex field types (anything list- or
dict-shaped) pydantic-settings runs `json.loads` on the environment value inside `EnvSettingsSource`,
*before* field validators run — so a `mode="before"` validator that splits on commas never gets a
chance, and the ordinary comma-separated form used by both `.env.example` and `docker-compose.yml`
is rejected as invalid JSON.

Worth noting how this surfaced: the default value made it invisible locally, and it only appeared
once something actually set the variable. It would otherwise have shown up as a container that
refuses to boot.

**Decision.** Annotate the field `Annotated[list[str], NoDecode]`, which passes the raw string to the
validator, and cover it with parametrised tests including the empty and space-padded cases.

**Consequences.** Any future list- or dict-typed setting needs the same annotation. The tests in
`tests/test_config.py` document why, so the next person adding one has a worked example rather than a
puzzle.

---

## ADR-010 · The E2E suite runs on dedicated ports

**Date:** 2026-07-26 · **Task:** T-01.10 · **Status:** Accepted

**Context.** With `reuseExistingServer: true` (the usual local default) the first smoke run tested an
entirely different application — an unrelated project was already serving port 3000, Playwright
reused it, and the suite dutifully asserted against someone else's page. Playwright cannot tell our
dev server from anyone else's; it only checks whether the port answers.

**Decision.** The suite runs the app on 3100/8100 with `reuseExistingServer: false`, overridable via
`E2E_FRONTEND_PORT` / `E2E_BACKEND_PORT`.

**Consequences.** Playwright always starts and owns the servers it tests, so a run cannot be
contaminated by whatever else is listening, and `make dev` can stay up on 3000/8000 while the suite
runs. The cost is a few seconds of startup per run, since nothing is ever reused. Cheap, against a
failure mode that produces confidently wrong results rather than an error.

---

## ADR-011 · The palette is violet, and the plan's researched values were wrong

**Date:** 2026-07-26 · **Task:** T-02.1 · **Status:** Accepted

**Context.** PLAN.md A3.1 supplied a researched palette explicitly flagged as unsampled. Eight real
screenshots of the product became available and were sampled in four passes: flat fills by modal
colour, text by most-common-dark-pixel (antialiasing makes a naive average far too light), dividers
by single-pixel edge scan, and glyphs by most-saturated-pixel. Screenshots are committed to
`docs/reference/fireflies/`.

**Three findings contradicted the plan materially:**

1. **The accent is `#6A39EF` violet, not `#2A6EF4` blue.** This touches every accented surface in
   the product — buttons, active nav, links, focus ring, selected rows, the active transcript line.
   Building on the blue would have made the clone wrong at a glance, which is precisely what the
   side-by-side comparison grades.
2. **Fireflies is white-on-white.** The plan assumed a `#F7F8FA` app background against white cards.
   In reality the topbar, left rail, main content and cards are all `#FFFFFF`, separated by a 1px
   `#ECEDF1` border. The surface hierarchy exists but is far subtler than assumed:
   `#FFFFFF` → `#FCFCFD` → `#F9FAFB`, the last being the search input and status chips.
3. **The logo mark is magenta (`#C43990`), not amber.** Amber does appear, but as the notice-banner
   tint `#FFFAEC`. A separate `--ff-brand-mark` token now carries the magenta.

**Decision.** Overwrite the palette with sampled values, marking every token `[S]` sampled or `[D]`
derived in both `tokens.css` and `design.md`.

**Consequences.** Because every component consumes semantic tokens, this was a one-file correction
with no component churn — which is the entire argument for building T-02 before any feature.
Substantial surface area remains uncalibrated: the whole notepad (active transcript line, speaker
colours, player), search-highlight colours, every hover state, and dark mode. Those are marked `[D]`
and should be re-sampled if a transcript screenshot appears.

---

## ADR-012 · `--ff-text-muted` deviates from the reference for accessibility

**Date:** 2026-07-26 · **Task:** T-02.1 (test T02-G) · **Status:** Accepted

**Context.** Fireflies' sampled muted grey is `#97A1B3`, used for timestamps, metadata and column
headers. On white it scores **2.60:1** — failing WCAG AA (4.5:1), AA-large (3:1), and even the 3:1
non-text floor. PLAN.md T02-G asks for ≥4.5:1 on this exact pairing, so the plan's own two goals —
pixel fidelity and contrast compliance — are in direct conflict here. Reaching 4.5:1 needs roughly
`#6C7481`, which reads as secondary body text and is visibly darker in a side-by-side.

**Decision.** Darken ~9% to `#8992A2` (3.14:1) and assert a 3:1 floor rather than 4.5:1. Every other
pairing in the file is held to 4.5:1.

**Consequences.** A shift invisible at normal zoom buys a genuine improvement, but the app is still
not AA on metadata text and axe will flag it in T-42 — knowingly, once, with this entry as the
justification. If accessibility is later prioritised over fidelity, the single-token change to
`#6C7481` is all that is required. The trade-off is enforced by a test
(`src/styles/tokens.test.ts`), so silently regressing past 3:1 breaks the build.

---

## ADR-013 · Speaker colour is authoritative in the database

**Date:** 2026-07-26 · **Task:** T-03 · **Status:** Accepted · *(resolves open decision #1)*

**Context.** Two mechanisms could decide a speaker's colour: `speakers.color_index` in the schema,
and `getSpeakerColor()` hashing the name on the client. With both live and neither declared the
winner, they diverge the moment either changes — and the symptom is a speaker who is violet in the
transcript and green in the participants list.

**Decision.** The stored `color_index` wins. It is computed once at ingest using the same FNV-1a
algorithm as the frontend. The client reads the stored value for persisted speakers and hashes
locally **only** for previews of transcripts not yet saved (the upload preview step, T-26.7).

**Consequences.** The hash is implemented twice, in Python and TypeScript, which is duplication — but
of a pure function with an explicit spec, covered by tests on both sides. In exchange the colour
survives a change to the hash implementation, and a speaker renamed from `Speaker 1` to a real name
keeps their colour instead of jumping to a different hue mid-meeting.

---

## ADR-014 · The FTS index outlives a soft delete, so search joins back to `meetings`

**Date:** 2026-07-26 · **Task:** T-03.9 · **Status:** Accepted · *(resolves open decision #2)*

**Context.** `transcript_fts` is maintained by triggers on `transcript_segments`. Soft-deleting a
*meeting* sets `meetings.deleted_at` and never touches its segments — so the segments stay indexed
and a naive `MATCH` query returns hits from deleted meetings. PLAN.md's T-35 test cases do not cover
this, so it would have shipped.

Two fixes were possible. Cascading the soft delete into segments was rejected: it makes restore
lossy and turns one UPDATE into thousands.

**Decision.** Every FTS query joins `meetings` and filters `deleted_at IS NULL`, and that join lives
in exactly one place — `app/db/search.py::search_segments`. Search paths must go through it.

**Consequences.** The index is knowingly "wrong" on its own; correctness lives in the query layer.
`tests/test_schema.py` asserts **both** halves — that the raw index still contains the row, and that
the helper does not return it — so a future refactor that simplifies the join away fails rather than
silently leaking. The same discipline will be needed for any future index built on segments.

---

## ADR-015 · The five canonical summary sections are composed by the API

**Date:** 2026-07-26 · **Task:** T-03 · **Status:** Accepted · *(resolves open decision #3)*

**Context.** PLAN.md gave `summaries` both an `overview TEXT` and a `bullet_notes JSON` column, and
gave `summary_sections` a `kind` enum including `'overview'` and `'keywords'` — while a dedicated
`keywords` table also existed. The overview had two homes, the notes two, keywords three, and
nothing decided which won.

**Decision.** One home each: the overview is a scalar on `summaries`; outline chapters and note
groups are `summary_sections` rows (`kind` narrowed to `outline|notes`); keywords stay in `keywords`;
action items stay in `action_items`. `bullet_notes JSON` is dropped. The five sections the UI renders
(design.md §2.4) are **composed by the API at read time** from those four sources.

**Consequences.** `GET /summary` does slightly more assembly. In exchange every part is queryable,
orderable and partially updatable — a JSON blob is none of those, which is the reason the rest of the
schema is relational. Regenerating a summary replaces section rows within one transaction rather than
rewriting a document.

---

## ADR-016 · Enums persist their value, not their Python member name

**Date:** 2026-07-26 · **Task:** T-03.7 · **Status:** Accepted

**Context.** Reading the autogenerated migration — which T-03.7 explicitly instructs — showed
`sa.Enum('AUDIO', 'VIDEO', 'NONE', ...)`. SQLAlchemy persists an enum's **member name** by default,
so the database would have stored `"AUDIO"` and the CHECK constraint would have permitted only the
uppercase spellings, while Pydantic, the JSON API, the seed fixtures and every test assertion use
`"audio"`.

The mismatch is invisible through the ORM, which translates in both directions. It surfaces only
where something reads the database directly: a raw SQL filter, a hand-written migration, a seed file,
an export.

**Decision.** A shared `enum_column()` helper passes `values_callable`, so the stored value is the
enum's value. One spelling from the database to the browser.

**Consequences.** Every enum column must go through the helper; a bare `sa.Enum(...)` would silently
reintroduce the bug. `tests/test_schema.py` asserts the raw stored strings via `text()` rather than
through the ORM, which is the only way this class of defect is visible.

---

## ADR-017 · The layering rule has no exceptions, including health checks

**Date:** 2026-07-26 · **Task:** T-04 · **Status:** Accepted

**Context.** `/api/health` has to run a real `SELECT 1` — a check that cannot fail tells the host
nothing, and the case that matters is a container whose volume never mounted, which answers HTTP
perfectly while every real request 500s. The obvious implementation puts `from sqlalchemy import
text` in the router, and it is easy to argue that infrastructure endpoints are a special case.

`scripts/check_layering.py` rejected it, which is exactly what it was built for.

**Decision.** No exception. The query moved to `HealthService.database_status()`, and the router
calls it like any other.

**Consequences.** One more file for four lines of logic. In exchange the rule stays absolute, which
is the only state in which a mechanical check is worth having — the moment it has one carve-out it
acquires a second, and then it is documentation rather than enforcement. It also means the health
probe is unit-testable without a request, which is how the 503 path is asserted.

---

## ADR-018 · The generated TypeScript client is committed and drift-tested

**Date:** 2026-07-26 · **Task:** T-04.12 · **Status:** Accepted

**Context.** `openapi-typescript` turns the API schema into `frontend/src/types/api.d.ts`, so a
backend field rename becomes a compile error in the frontend instead of a runtime `undefined`. That
promise holds only while the generated file is current, and nothing forces anyone to re-run the
generator after editing an endpoint.

**Decision.** Commit both `docs/openapi.json` and the generated client, and add
`tests/test_openapi_drift.py`, which compares the committed schema against the live app and fails
with the exact remedy (`run make types`) plus a diff of added/removed paths.

The schema is exported from the app object rather than by curling a running server, so `make types`
works from a cold clone with nothing started and no port to guess.

**Consequences.** Editing an endpoint now requires re-running `make types` before the build passes.
That friction is the point — it is what makes the type safety real rather than aspirational. The
alternative, regenerating in CI and committing automatically, hides schema changes inside unrelated
commits.

---

## ADR-019 · Seeded meetings are 5–17 minutes, not the plan's 14–55

**Date:** 2026-07-26 · **Task:** T-05 · **Status:** Accepted

**Context.** PLAN.md T-05.1 specifies eight meetings running 14:47 to 55:32. Durations are **derived**
from the transcript (T-05.10) rather than authored, so a meeting is exactly as long as what is
actually said in it. The eight fixtures total 607 segments of genuine dialogue; timed at 150 wpm
that is roughly 67 minutes of speech, producing meetings of 5 to 17 minutes.

Hitting the plan's table would need roughly 2,500 segments — about four times the dialogue written
here, and the bulk of the remaining effort in the task.

Two things were considered and rejected:

- **Inflating the inter-speaker gaps to reach the target durations.** This is the tempting one, and
  it is a fabrication: two of the meetings have real audio attached, so a listener scrubbing the
  player would hear thirty seconds of nothing between lines. The number would be right and the
  artefact would be wrong.
- **Hardcoding `duration_seconds`.** That breaks the derivation the schema depends on and would fail
  T05-B, which exists precisely to stop the denormalised column drifting from the transcript.

**Decision.** Keep derived durations. One honest adjustment was made: the gap range moved from the
plan's 200–600ms to 700–2,600ms, because 200ms is the rhythm of a fast two-person exchange and a
meeting has thinking time, unmuting and pauses. That is a correction to an unrealistic assumption,
not a lever pulled to reach a number — and it is documented in `timing.py` as such.

**Consequences.** Durations read as varied and plausible (4:57 through 17:02) but shorter than a real
company's calendar. The longest meeting is 159 segments, which is still enough for virtualisation to
be a genuine and measurable improvement in T-20. Every seeded value remains internally consistent,
which is what the tests can actually verify. Extending the fixtures later requires no code change —
only more dialogue in the JSON.

---

## ADR-005 · Client-side data fetching, not RSC

**Date:** 2026-07-26 · **Task:** T-06 · **Status:** Accepted

**Context.** App Router makes server components the default, and fetching in an RSC would mean
smaller bundles and no client-side loading state. This app does the opposite: every data-touching
page is `"use client"` and reads through TanStack Query. That deserves an explicit defence, because
*"why App Router if everything is a client component?"* is the obvious question.

**Decision.** Client-side fetching, for three reasons RSC does not serve:

1. **Cross-surface cache invalidation is the hard part of this app.** Ticking an action item in the
   Notepad has to update the Notebook row's "N open" badge and the details drawer (T-24.12). Under
   RSC that is a router refresh which refetches the whole tree; with a shared query cache it is one
   `invalidateQueries` against a nested key.
2. **Optimistic updates.** The graded interactions — checkbox toggles, inline title edits, undoable
   deletes — must apply in under 100ms and roll back on failure. That is client state by definition.
3. **URL-as-state with instant feedback.** Filters live in the query string and must be shareable,
   but a server round-trip per keystroke is not acceptable; the cache serves the previous page while
   the next loads.

**Consequences.** App Router earns its place through file-based routing, layouts, `next/font`,
streaming boundaries and `loading.tsx`/`error.tsx` — not through server rendering of data. Bundles
are larger than an RSC-first build would be. If this app ever grows a genuinely static, read-only
surface — a publicly shared transcript, say — that route should be an RSC, because none of the three
reasons above apply to it.

---

## ADR-020 · Three CSS Grid traps, all of which failed silently

**Date:** 2026-07-26 · **Task:** T-06.2/T-06.10 · **Status:** Accepted

**Context.** The shell is CSS Grid, and building it hit three failures in a row that shared a shape:
no console error, nothing obviously wrong in the CSS, and a visibly broken page.

1. **`1fr` does not mean "shrinkable".** A track sized `1fr` still floors at its content's
   min-width, so the topbar's natural width (440px) became the column width inside a 393px viewport
   — and the horizontal scrollbar appeared on the *page* rather than on the offending element. Fixed
   with `minmax(0, 1fr)`, needed on the outer **and** inner grid; missing it on either is enough.
2. **`display: none` removes an element from grid PLACEMENT.** Hiding the sidebar at mobile meant
   `<main>` auto-placed into the first track — the 0px rail column — and rendered a completely blank
   page below the topbar. Fixed by declaring a single column below `md` rather than a zero-width
   rail track.
3. **`min-height: auto` on grid items.** Same family: an overflowing `<main>` stretches its row so
   the page scrolls instead of the panel. `min-h-0` is the one line that makes "only panel interiors
   scroll" (T-18.10) work at all.

**Decision.** All three fixed at the shell with the reasoning inline, since the Notepad's two
resizable panels (T-18) sit inside this grid and would otherwise hit every one of them again.

**Consequences.** The `scrollWidth - clientWidth` assertion in the responsive tests is what catches
this class of bug. None of the three produced an error, and two were visible only in a screenshot —
which is a good argument for the responsive tests existing at all rather than being deferred to a
manual pass.

---

## Pending decisions

Tracked so they are not silently defaulted. Each becomes an ADR when settled.

| # | Decision | Settle by |
|---|---|---|
| ~~1~~ | ~~Speaker colour authority~~ | ✅ ADR-013 |
| ~~2~~ | ~~FTS5 rows survive a meeting's soft delete~~ | ✅ ADR-014 |
| ~~3~~ | ~~Who composes the five summary sections~~ | ✅ ADR-015 |
| ~~4~~ | ~~`/` welcome screen vs Home dropped from the nav~~ | ✅ T-06 — `/` redirects, Home removed |
| 5 | Filters panel: draft-then-Apply vs live-apply (T-13.5 offers both; pick one, be consistent) | T-13 |
| 6 | Notebook layout: the reference screenshots show date-grouped **cards**, PLAN.md A2.1 specifies a **column table**. Grading is a screenshot comparison, so the screenshot probably wins — but the plan's `data-testid` names and hover spec are the test contract | T-12 |
