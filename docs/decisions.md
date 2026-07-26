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

## ADR-021 · The rail is measured from the reference, not taken from the plan

**Date:** 2026-07-26 · **Task:** T-07 · **Status:** Accepted

**Context.** T-07 is the first task where pixel fidelity *is* the deliverable, and T-02 had already
shown the plan's researched values could be wrong. So the rail geometry was measured off
`docs/reference/fireflies/03.png` rather than typed in from the spec table. Scale was recovered by
assuming the documented 240px rail width and reading the divider position (x=332), giving
1 CSS px = 1.383 image px.

**Measured against specified:**

| | PLAN.md T-07 | Measured | Used |
|---|---|---|---|
| Item height | 36px | 35.4px | 36px ✓ |
| Item pitch | 40px (2px margin) | 39.8–41.9px | 40px ✓ |
| Inner padding | 12px | 13.0px | 12px ✓ |
| **Pill inset** | **8px** (`margin: 2px 8px`) | **12.3 / 11.6px** | **12px** |
| **Background** | **`--ff-surface-1`** | **`#FFFFFF`** | **`--ff-surface-0`** |

**Decision.** Follow the measurements on both divergences.

The background one matters most and follows directly from ADR-011: Fireflies is white-on-white, with
a 1px `#ECEDF1` border doing the separating. A grey rail against white content is wrong at a glance
in exactly the side-by-side comparison this project is graded on.

The 12px inset is subtler but visible — at 8px the pill sits noticeably closer to the rail edge than
the reference.

**Consequences.** design.md §3.7's `rail 240 / collapsed 64` still holds; only the inset and the
background changed. The tests assert on **computed** values resolved through the token layer rather
than on class names, so a test cannot pass while the token behind it is broken.

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

## ADR-022 · User input is not a query language

**Date:** 2026-07-26 · **Task:** T-08.3 · **Status:** Accepted

**Context.** The first test of the search endpoint that typed punctuation returned a 500:

```
sqlite3.OperationalError: fts5: syntax error near "."
```

The value was bound, so this was never SQL injection. The problem is one layer up: FTS5 parses the
*bound string* as its own query language, where `*`, `"`, `:`, `^`, `-`, `(` and `NEAR` are
operators. A user typing `a.*b` into a search box means those five characters.

**Decision.** `app/db/search.py::to_fts_query()` tokenises input to word characters, phrase-quotes
each token, drops single-character tokens, and appends `*` to the last one so results narrow while
typing. It lives at the **db layer**, not in the service, so T-35's call sites inherit it rather
than each re-deriving it. Empty output means "no match", never "match everything".

The same reasoning applies twice more in this task: `_title_ranges` uses `re.escape` rather than
compiling user input as a pattern, and the title `LIKE` passes `autoescape=True` so a search for
`50%` does not become a wildcard.

**Consequences.** Some FTS5 power (explicit `NEAR`, boolean operators) is unreachable from the
plain search box. T-35 specifies a deliberate query syntax — quoted phrases, `-exclusion`,
`speaker:` — which is the right place to expose that, because then it is a documented feature rather
than punctuation the parser happens to accept.

---

## ADR-023 · Search sends match ranges, never markup

**Date:** 2026-07-26 · **Task:** T-08.3/T-08.10 · **Status:** Accepted

**Context.** Highlighting a search hit needs the server's knowledge — FTS5 stemming means a query
for `pricing` matches `priced`, and the client cannot re-derive which characters matched. The
obvious implementation is `snippet(transcript_fts, 0, '<b>', '</b>', …)` and
`dangerouslySetInnerHTML` on the client.

**Decision.** The API returns `matches: [{start, end}]` and plain text. `SearchService` asks SQLite
to delimit with `\x02`/`\x03` — control characters that cannot appear in transcript text — then
converts those to offsets and strips them before serialising.

Transcripts are user content. A meeting where somebody reads out an HTML tag would, under the markup
approach, inject it into every dropdown that surfaces the line. Offsets make that structurally
impossible: the `Highlighter` primitive splits into text nodes and wraps them in `<mark>`, so
`<img src=x onerror=…>` renders as thirty visible characters.

**Consequences.** Two extra conversion steps and a primitive the whole app must use for highlighting
— `Highlighter` also backs T-22's find bar and T-35's results page. The e2e suite stubs the API with
a transcript containing an `onerror` payload and asserts `window.__pwned` never appears, so the
guarantee is tested rather than assumed.

---

## ADR-024 · ⌘K is a callback, not mirrored state

**Date:** 2026-07-26 · **Task:** T-08.4 · **Status:** Accepted

**Context.** `useCommandPalette` (T-06.11) owned an `isOpen` boolean. Wiring the real search field
to it meant mirroring that boolean into the field's own state via an effect — which
`react-hooks/set-state-in-effect` rejected, correctly.

Suppressing the rule would have shipped a genuine bug. The hook's ⌘K handler *toggled*, so the two
copies could disagree: clicking outside closed the field but left `isOpen` true, and the next ⌘K
toggled the stale flag to false — the shortcut appeared dead until pressed twice.

**Decision.** The hook registers the binding and fires `onTrigger`; it holds no state. `GlobalSearch`
owns the single copy of "is the search open".

The same reasoning removed the second effect in that component: the highlighted row is now *derived*
during render (`preferredId` if it still exists in the current rows, else the first row) rather than
stored and re-synced whenever the rows change.

**Consequences.** Two effects and one whole category of state-desync bug are gone. This is the third
time in this project the lint rule has pointed at a real defect rather than a style preference —
after `use-local-storage` and `use-sidebar` — which is worth recording as evidence that the rule
earns the friction.

---

## ADR-025 · Toasts and the search endpoint built ahead of their tasks

**Date:** 2026-07-26 · **Task:** T-08 · **Status:** Accepted

**Context.** T-08 depends on two things PLAN.md schedules later. T-08.6's `Sign out` is specified as
showing an info toast, and the toast system is T-09. T-08.3's dropdown needs
`GET /api/v1/search`, specified under T-35.1.

**Decision.** Build minimal versions of both now rather than stub them.

Stubbing the endpoint would have meant every dropdown test asserting against fixtures instead of
real FTS ranking — the debounce, the grouping and the empty state would all have been verified
against data that could not disagree with them. And a temporary inline banner for `Sign out`,
replaced a task later, leaves that behaviour untested at the point it ships.

**Consequences.** T-09 extends the toast API (actions, promise toasts, the undo pattern) rather than
creating it; T-35 extends search with query syntax, filters, ranking transparency and pagination.
Both were built to be extended: `ToastProvider` already carries variants and durations, and the
search response is already the grouped shape T-35 needs. This is the only deviation from the plan's
task ordering so far, and it is recorded here rather than left for a reader to notice.

---

## ADR-026 · An undo handler cannot own a component-scoped mutation

**Date:** 2026-07-26 · **Task:** T-09.4 · **Status:** Accepted

**Context.** `useDeleteWithUndo` first used `useRestoreMeeting()` — a `useMutation` — inside the
toast's `Undo` handler. Deleting worked, the toast appeared, and clicking `Undo` did nothing at all:
no restore, no confirmation, no error.

A `useMutation` observer belongs to the component that called the hook. Here that component was the
row's delete button, inside the row that the successful delete had just removed from the list. By
the time the user clicked `Undo`, the observer had unsubscribed with its component and `mutate()`'s
callbacks never fired.

**Decision.** The undo path calls `api.post(...)` directly and invalidates `qk.meetings.all` itself.

The general rule this instance illustrates: **an undo handler outlives whatever raised it**, so it
cannot depend on that thing still being mounted. Any handler that survives in a toast, a
notification or a timer has the same constraint.

**Consequences.** The restore bypasses the `MutationCache`, and therefore the global error toast
from T-09.11 — so it reports its own failure explicitly. Saying "couldn't restore" matters more than
usual here, because the user has been told the meeting was deleted and now believes it is back.

The bug was invisible in isolation and only showed up as a missing toast, which is a good argument
for T09-B asserting the *restored meeting reappears* rather than just that a toast is shown.

---

## ADR-027 · Tests that write get their own Playwright project

**Date:** 2026-07-26 · **Task:** T-09 · **Status:** Accepted

**Context.** Until T-09 every e2e test only read, so four workers sharing one seeded database was
safe. Delete-and-undo broke that immediately: while `T09-A` has a meeting deleted, `03-shell`'s
"renders seeded meetings end to end" asserts there are exactly eight, and which one wins depends on
scheduling. `T09-B` passed run alone and failed in the suite — the signature of this class of bug,
and the reason "run the whole suite before merging" is a rule here.

**Decision.** Tests that write are tagged `@mutates` and run in a `mutations` project that
`dependsOn` the read-only one, with `fullyParallel: false`. Playwright finishes every reader before
the first writer starts, and the writers do not race each other. Each writer also restores what it
changed, so the next one starts from the seeded state.

**Rejected: a database per worker.** It is the right answer for a suite ten times this size, but it
needs a backend process per worker, and the startup cost would exceed the entire current run.

**Consequences.** Writers are serial, so they are the wall-clock floor as they multiply — T-14's bulk
delete, T-26's create and T-28's delete all land in this project. The tag is the whole contract: a
new writing test that forgets `@mutates` runs in the parallel project and produces exactly the flake
described above. That is worth watching for in review.

---

## ADR-028 · Radix for the parts that are invisible when wrong

**Date:** 2026-07-26 · **Task:** T-10 · **Status:** Accepted

**Context.** T-10 builds 20 primitives. The visual layer is ours — every one is styled entirely
from tokens — but several need behaviour that takes a day to write and a year to get right: a focus
trap that survives dynamic content, `inert` on the rest of the page, scroll-lock that compensates
for the scrollbar's width, roving focus with typeahead, and collision detection that flips a panel
near a viewport edge.

**Decision.** Radix for `Dialog`, `DropdownMenu`, `Select`, `Popover`, `Tabs`, `Checkbox`, `Switch`,
`RadioGroup` and `Tooltip`. Everything else — `Button`, `Chip`, `Badge`, `Avatar`, `Pagination`,
`ProgressBar`, `Skeleton`, `EmptyState`, `SearchInput`, `Highlighter`, `ResizablePanels`,
`DatePicker` — is hand-written, because their hard parts are ours, not the platform's.

Notably `DatePicker` pulls in no date library: start-of-day, add-days and end-of-month are three
lines of `Date` arithmetic, and the presets (`Last 7 days`) are the actual feature.

**Consequences.** Nine dependencies, all headless, none carrying styles. The audit surface did not
change — the 14 high findings are still build-time toolchain transitives, none from Radix.

Radix is unstyled, so its accessibility guarantees are not automatic: three of its controls render
as `<button>` and axe flagged all of them (ADR-029).

---

## ADR-029 · Radix controls need explicit names, not sibling labels

**Date:** 2026-07-26 · **Task:** T-10.16 · **Status:** Accepted

**Context.** Checkbox, Switch, Radio and Select were each written with a visible `<label htmlFor>`
pointing at the control's id — the correct pattern for a native input. The axe scan on
`/dev/components` reported **eleven critical `button-name` violations**.

Radix renders these controls as `<button role="checkbox">`, `<button role="switch">`,
`<button role="radio">` and `<button role="combobox">`. `<label for>` names a native input reliably;
for a button, browsers and screen readers do not expose that association, so every one of them was
announced as an unnamed button.

**Decision.** Every one gets `aria-labelledby` pointing at the label's own id. The visible `<label>`
stays — it still makes the text clickable — but the accessible name comes from the explicit
reference.

**Consequences.** Caught only because T10-L runs axe over a page that renders every primitive in
every state. A checkbox tested through the one feature that uses it would have looked fine. This is
the argument for the gallery existing at all, and it is why T-39/T-40 extend axe to eight surfaces
rather than treating this as done.

---

## ADR-030 · A controlled Modal must restore focus itself

**Date:** 2026-07-26 · **Task:** T-10.10 · **Status:** Accepted

**Context.** T10-C asserts that closing a modal returns focus to whatever opened it. It did not —
focus landed on `<body>`, dumping a keyboard user at the top of the document.

Radix restores focus by itself when the dialog is opened through `Dialog.Trigger`. Our `Modal` is
CONTROLLED: callers render their own button and flip `open`. There is no trigger for Radix to
remember.

**Decision.** `onOpenAutoFocus` fires *before* Radix moves focus into the dialog, so
`document.activeElement` at that instant is still the thing that opened it. Capture there, restore
in `onCloseAutoFocus`. Guarded on `isConnected`, because the trigger may have unmounted while the
dialog was open — a row's kebab after the row was deleted — and focusing a detached node silently
does nothing.

**Consequences.** The controlled API is kept, which every caller in T-14, T-26 and T-28 needs, and
the focus contract holds without callers passing a ref. `ConfirmDialog` layers `initialFocusRef` on
top so focus lands on **Cancel**: Enter still travelling from the keystroke that opened a
destructive dialog must not delete anything.

---

## ADR-031 · Raw `<button>`, `<input>` and `<select>` are lint errors outside components/ui

**Date:** 2026-07-26 · **Task:** T-10.18 · **Status:** Accepted

**Context.** "Build once, reuse everywhere" is a convention until something enforces it. Turning
the rule on surfaced **20 violations** across code written in T-06 to T-09 — every one of them a
control that had reimplemented a height, a hover state and a focus ring by hand.

**Decision.** `no-restricted-syntax` on `JSXOpeningElement` for `button`, `input` and `select`,
scoped to `src/features/**`, `src/app/**` and `src/components/layout/**`. `components/ui/` is
exempt, since that is where the primitives are defined.

All 20 were fixed rather than suppressed, and two of them were real bugs rather than duplication:

**The global search field was a second implementation of `SearchInput`.** It now uses the primitive,
with combobox ARIA passed in — one field component, three call sites.

**The drawer backdrop was a `<button>`,** on the reasoning that an invisible click target should be
reachable. That was wrong: it inserted a tab stop announcing "Close menu" immediately before the
real Close button, so keyboard and screen-reader users met the same action twice. Tap-outside is a
POINTER affordance; it is now `aria-hidden`, and Escape and the visible button serve everyone else.

**Consequences.** Adding a control now means using or extending a primitive. Where a primitive did
not fit, it was extended rather than bypassed — `SearchInput` gained combobox props, `menu.tsx`
gained `MenuRadioItem` — which is the outcome the rule is for.

---

## ADR-032 · Eager-by-default relationships were loading the whole transcript

**Date:** 2026-07-26 · **Task:** T-11.7 · **Status:** Accepted

**Context.** T11-L counts statements on a 20-item page. It found 13, and four of
them were `SELECT ... FROM transcript_segments`, `speakers`, `action_items` and
`summary_sections`.

Every relationship on `Meeting` had been declared `lazy="selectin"` — a reasonable-looking default
that means "never N+1". For the Notebook list it meant every page loaded **~1,200 transcript
segments per meeting, twenty meetings at a time**, plus every action item and every summary section.

None of it appeared in the response: `MeetingListItem` does not have those fields, so the payload
was correct and light while the query cost was enormous. This is exactly the deduction T-04.4 warns
about, arriving through the back door — and the only way to see it was to count statements.

**Decision.** `segments`, `speakers`, `action_items` and `Summary.sections` are lazy. Callers that
need them opt in with `selectinload`. The small, bounded collections a row actually renders
(`participants`, `keywords`, `tags`, `summary`) stay eager.

**Consequences.** Nine statements for a full page instead of thirteen, and none of them touching a
transcript. The test asserts both the bound and, explicitly, that
`FROM transcript_segments` does not appear — a count alone would pass again if something heavy came
back under a different name.

**DEVIATION from T11-L, which asks for ≤ 4.** The floor for this model is 8: the page query, the
count, four `selectinload`s, and two grouped aggregates. Reaching 4 would mean denormalising counts
onto `meetings` or dropping fields from the row — trading a real correctness surface for a number.
What the case protects is that the count does not GROW with the page, and that is asserted directly
by its own test.

---

## ADR-033 · An unknown sort key is a 400, not a silent fallback

**Date:** 2026-07-26 · **Task:** T-11.5 · **Status:** Accepted

**Context.** `list_meetings` previously did `SORTABLE.get(sort, SORTABLE[DEFAULT])` — an unknown key
quietly sorted by the default. Safe against injection, which was the point at the time, and wrong in
a different way.

**Decision.** An unknown key raises `InvalidSortError` → **400 `INVALID_SORT`**, with the allowed set
in `details`.

A fallback hides a client bug in the worst possible way: the caller believes it sorted by one thing
and is looking at another, with nothing to distinguish that from data that happens to be ordered
oddly. A 400 makes it a five-second fix.

This also introduced `BadRequestError` as a category distinct from 422. FastAPI raises 422 when a
value fails to PARSE; 400 is for a value that parsed fine and is still not allowed. Collapsing them
leaves the client unable to tell "you sent a string where I wanted an int" from "that is not a
column".

**Consequences.** One existing test asserted the old fallback and was updated — deliberately, with
the reasoning recorded in the test itself rather than silently flipped.

---

## ADR-034 · List responses are validated with a weak ETag over the body

**Date:** 2026-07-26 · **Task:** T-11.11 · **Status:** Accepted

**Context.** The Notebook re-requests the same list constantly — every navigation back, every filter
toggled and untoggled. Those requests should be cheap, and they must never be stale: a meetings list
that still shows a meeting the user deleted is worse than a slow one.

**Decision.** `Cache-Control: no-cache` plus a weak ETag digested from the serialised response.

`no-cache` does not mean "do not cache" — it means "cache it, but revalidate before reuse". Paired
with an ETag, a repeat request costs a 304 and no body, while any change anywhere in the page
changes the digest. `max-age` would have been the bug.

The digest is taken over the BODY rather than a `MAX(updated_at)` high-water mark, because the page
contains aggregates — action-item counts, participant totals — that no single row's timestamp
covers. A body digest cannot go stale by construction.

`W/` is honest about strength: the digest is over Pydantic's JSON, so two equivalent encodings would
compare unequal. Weak comparison is all `If-None-Match` on a GET needs.

**Consequences.** Every list response serialises twice on a cache miss (once to digest, once to
send). At this scale that is invisible, and it buys a correctness property that is hard to get any
other way. The 304 is raised as an exception rather than returned, so the handler's return type
keeps describing what the endpoint actually produces.

---

## ADR-035 · Routers get their enums from schemas, not models

**Date:** 2026-07-26 · **Task:** T-11.1 · **Status:** Accepted

**Context.** The list endpoint takes `?source=` typed as `MeetingSource`, which lives in
`app.models.enums`. The layering guard rejected the import.

The guard was arguably over-broad here — an enum is a value type, not ORM access. But ADR-017
settled that the rule has no exceptions, on the grounds that every exception is a precedent and the
guard's value is that it cannot be argued with.

**Decision.** `app.schemas.meeting` re-exports the enums, and routers import from there.

This is better layering, not just guard appeasement: the API layer's vocabulary should come from the
API contract. If `MeetingSource` ever needs to differ between storage and wire — a renamed member, a
value the API accepts but never stores — the seam already exists.

**Consequences.** One re-export block, and the guard stays absolute. Third time the rule has forced a
better structure rather than a worse one (ADR-017, ADR-031).

---

## ADR-036 · The Notebook is a date-grouped card list, not a column table

**Date:** 2026-07-27 · **Task:** T-12 · **Status:** Accepted · **Closes pending decision #6**

**Context.** design.md §2.2 flagged this at the start and deferred it to T-12. PLAN.md A2.1 and the
T-12 row spec describe a dense column table: 72px rows, a sticky header, and columns for date,
duration, participants and action items. `docs/reference/fireflies/02.png` shows something else
entirely — meetings as **bordered cards in a vertical list, grouped under date headings**
(`Sat, Jul 25`), each card carrying a leading tile, a title, and one metadata line reading
`Jul 25 · 9:00 AM · 30 min · Goyal`. No columns. No table header.

This is the third time the plan's researched values have conflicted with the reference, after the
accent colour (ADR-011) and the rail metrics (ADR-021).

**Decision.** Follow the reference, for the same reason as the previous two: the project is graded
on looking like Fireflies, and a side-by-side comparison is where a wrong layout is most obvious.

The plan's own ❌ list is satisfied rather than contradicted. It rules out *"a card grid by default
(Fireflies' primary view is the list)"* — and this **is** a list. The card grid is T-12.13's
opt-in Grid view, behind the segmented toggle, exactly where the plan puts it.

**What was kept from the plan.** Everything that is not the column geometry: the leading
thumbnail/checkbox cross-fade with a reserved 40×40 box, the roving-tabindex keyboard navigation,
the kebab with its submenus, the avatar group with counted overflow, the action-item badge as a
badge rather than a bare number, every `data-testid`, and — as it turned out — the 72px height,
which the card is pinned to via the `row` token.

The reference's cards carry less information than the plan's rows. Where the API has more to show,
it is shown: participants and action items sit at the trailing edge of the card, and a
transcript-only search hit adds a `match_context` line (T-11.3). Matching the reference's *layout*
does not mean matching its *feature set* downward.

**Consequences.** Two test cases were adapted, with the reasoning inline in the spec rather than
silently rewritten:

- **T12-B** asserted `height === 72` on a table row. The card is pinned to the same token, so the
  assertion survives unchanged — and the skeleton now mirrors the card's box model rather than
  maintaining its own height, which is what stops the two drifting.
- **T12-I** asserted a sticky column header at `y=56`. This layout has no column header, so there is
  nothing to stick. The property it protected — the topbar surviving a long scroll — is already
  covered by T08-K.

Grouping is suppressed when the sort is not chronological: a title-sorted list would put every
meeting under its own date heading, which is noise rather than structure.

---

## ADR-038 · Assert the wiring when the interaction cannot be simulated

**Date:** 2026-07-27 · **Task:** T-10.8 · **Status:** Accepted

**Context.** `T10-G` originally hovered the AvatarGroup's `+N` chip and read the tooltip. It passed
on macOS and failed all three attempts on Linux CI — twice. The first fix moved the *content*
guarantee onto an `aria-label` (the right fix, and a real product improvement) but kept a separate
hover test, on the grounds that its failure "would not be a correctness failure". It then broke the
build.

Radix's tooltip opens from `pointermove` heuristics that Playwright's synthetic events do not
reproduce reliably across platforms.

**Decision.** Assert what can be asserted deterministically — that the chip is wired as a tooltip
trigger (`data-state` is present) — and let the content guarantee live where it cannot flake: the
`aria-label` in `T10-G`, and `overflowLabel`'s unit tests.

**The general rule.** A test that cannot be made deterministic is worse than no test: it trains the
team to re-run the build, and the next real failure gets re-run too. When an interaction cannot be
simulated faithfully, assert the wiring and move the guarantee to a layer that can be.

That the *accessible* path is the one left under test is not a consolation prize — a tooltip does
not exist for touch users and is not reliably announced, which `tooltip.tsx` says in its own header.

**Consequences.** Visual tooltip behaviour is unverified by the suite. Acceptable: it is one
presentational affordance on a secondary control, and the information it shows is guaranteed twice
over elsewhere.

---

## ADR-037 · Every test that writes lives in one file

**Date:** 2026-07-27 · **Task:** T-12 · **Status:** Accepted · **Extends ADR-027**

**Context.** ADR-027 gave writing tests their own Playwright project so they could not race the
readers. T-12 added a second mutating spec, and the suite went intermittently red again: `T09-A`
deleted the first row while the notebook's kebab test was counting rows.

`fullyParallel: false` serialises tests within a **file**. Files still run in parallel across
workers. So one mutating file was safe and two were not — and the failure rate was about one run in
three, which is the worst possible frequency: often enough to matter, rare enough to be dismissed as
a flake.

**Decision.** All `@mutates` tests live in `tests/90-mutations.spec.ts`. The rule is short enough to
hold in review: **if a test writes, it goes there, and it restores what it changed.**

**Rejected: `workers: 1`.** Playwright has no per-project worker count, so this would serialise the
entire suite — a 1.5-minute run becomes several minutes to protect four tests.

**Consequences.** Mutating coverage is not co-located with the feature it exercises, which is a real
cost to discoverability; the file's header comment explains why, and each test names the task it
belongs to. Three consecutive full-suite runs were clean before merging, which is now the bar for
anything touching this area — one green run does not distinguish "fixed" from "got lucky".

---

## ADR-039 · The filters panel is draft-then-Apply

**Date:** 2026-07-27 · **Task:** T-13.5 · **Status:** Accepted · **Closes pending decision #5**

**Context.** T-13.5 offers both models and requires a choice. The panel has seven sections: host,
participants, date, duration, tags, channel and an action-items switch.

**Decision.** Draft-then-Apply.

Live-apply means a request per checkbox. A user narrowing by host, then date, then duration fires
three or more round-trips and watches the list churn under them — and the intermediate states are
ones nobody asked to see. With seven sections that is the common path, not an edge case.

The plan's own specification points the same way: a sticky footer holding `Clear all` and `Apply`,
and a discard-with-toast on dismissal, only mean anything if the changes are drafts.

**The cost, and what pays for it.** Draft models are confusing when the user cannot tell what is
committed. Two things resolve that: the active-filter chip row above the list always shows the
APPLIED state, and dismissing a dirty panel says `Filters not applied` rather than silently
discarding six clicks.

**Consequences.** The draft is reseeded from the applied state each time the panel OPENS, keyed on
`open` rather than on the applied filters — reseeding while the panel is open would wipe the user's
in-progress edits the moment anything else touched the URL.

---

## ADR-040 · The e2e suite runs against a production build

**Date:** 2026-07-27 · **Task:** T-13 · **Status:** Accepted

**Context.** Three T-13 search tests failed in the suite and passed alone. The symptom was that a
debounced write to the URL "never happened" — so the obvious suspects were the debounce, the
controlled input, and the fixed clock. None of them was the cause.

`next dev` compiles routes and RSC payloads on demand. With four Playwright workers, the first
client navigation in each worker waited seconds on the dev compiler, and the URL only updates once
that navigation commits. Warming the routes with a plain fetch did not help, because the flight path
is compiled separately.

**Decision.** The `webServer` runs `next build && next start`.

Beyond removing that class of flakiness, it means the suite exercises what actually ships: minified,
production React, no StrictMode double-invocation of effects.

**Consequences.** ~40 seconds of build time per run, against several seconds of compile stalls per
worker. The `/dev/*` surfaces were gated on `NODE_ENV === 'production'`, which meant "these pages
exist only where we do not test them" — they now check an explicit
`NEXT_PUBLIC_ENABLE_DEV_SURFACES` flag that only the e2e config sets. Two of the three were not
gated at all and would have shipped; that is now fixed.

---

## ADR-041 · Search-param changes use history.pushState, not the router

**Date:** 2026-07-27 · **Task:** T-13.8 · **Status:** Accepted

**Context.** With the production build in place, filter chips and `Clear all` still took seconds to
take effect and often appeared not to work at all.

Next's App Router treats a search-param change as a navigation: it fetches a fresh RSC payload for
the route before the URL updates. Every page in this app fetches its data client-side through
TanStack Query (ADR-005), so that round-trip returns a payload nothing consumes — pure latency on
the interaction the Notebook is built around.

**Decision.** `setParams` uses `window.history.pushState` / `replaceState`. Next 15+ integrates the
native history methods with `usePathname` and `useSearchParams` for exactly this case: the URL
updates synchronously, the hooks re-render, and Back still works because a real history entry is
created.

**Consequences.** Filtering is instant. `router` is no longer needed in `useQueryParams` at all. Any
future page that DOES render server-side must not use this hook for its filters — it would update
the URL without re-rendering the server component. Nothing does today, and ADR-005 explains why.

---

## ADR-042 · A debounced input must not fire on mount

**Date:** 2026-07-27 · **Task:** T-13.1 · **Status:** Accepted

**Context.** With the two fixes above in place, filter chips *still* did nothing on any page opened
with query parameters — while the same controls worked from a bare `/notebook`. React was hydrated,
handlers fired, and local-state controls responded.

`SearchInput`'s debounce effect ran on mount and reported the initial value as though the user had
typed it. On the Notebook that meant every page load rewrote the URL ~250ms later, and a click
landing inside that window had its navigation clobbered by the rewrite.

**Decision.** The effect skips its first run.

**The general shape.** "Notify when this value changes" and "notify with this value" are different
contracts, and `useEffect` gives you the second by default. Any debounced callback wired to a
controlled input has this bug latent in it.

**Consequences.** A caller that genuinely wants the initial value can read it directly — it is the
value they passed in. The bug took three wrong hypotheses to find because every symptom pointed at
navigation; the lesson recorded here is that a spurious *write* looks exactly like a failed write.

---

## ADR-043 · Selection survives paging but not filtering

**Date:** 2026-07-27 · **Task:** T-14.1 · **Status:** Accepted

**Context.** T-14.1 says to clear the selection on filter *or* page change. Those two are not the
same event.

**Decision.** Selection survives paging and is cleared — with a toast — when the filters change.

Paging is navigation within one result set: picking three meetings on page 1 and two on page 2
plainly means five, and T-14.9's "Select all 47 matching" only makes sense if crossing a page
boundary does not discard what came before.

A filter change is different. It can remove the selected rows from the result set entirely, and the
next action available is **Delete**. Silently destroying something the user can no longer see is the
worst outcome on offer here, so the selection goes and the toast says so.

**Consequences.** The select-all checkbox is scoped to the current PAGE while the bulk bar counts
ALL selected — deliberately, since they answer different questions ("is this page picked?" versus
"how many will this delete?"). An empty page reports `none` rather than `all`: `every()` on an empty
array is true, which would render a checked box over nothing.

---

## ADR-044 · Shift-click is handled in the capture phase

**Date:** 2026-07-27 · **Task:** T-14.3 · **Status:** Accepted

**Context.** Shift-clicking to select a range selected two rows instead of the range between them.

Radix's checkbox reports only the resulting state, never the modifiers that produced it, so the
shift handler sat on a wrapper. On the way back up, the checkbox's own toggle had already run — and
that toggle moves the range's ANCHOR to the row just clicked, so the range was always from a row to
itself.

**Decision.** `onClickCapture` on the wrapper: a shift-click is intercepted before the checkbox sees
it, and the plain toggle never runs.

The range also always SELECTS rather than toggling. A range that flipped each row's state would
leave holes wherever the user had already picked one, which is not what dragging a selection means
anywhere else.

**Consequences.** Two behaviours now depend on event-phase ordering, which is easy to break without
noticing — the unit tests cover the anchor semantics directly (`useSelection`), so a regression
shows up there rather than only in a browser.

---

## ADR-045 · The list row and the details drawer get different participant shapes

**Date:** 2026-07-27 · **Task:** T-15.8/T-15.9 · **Status:** Accepted

**Context.** The drawer needs each participant's email, whether they attended, how long they spoke,
and their speaker colour. The obvious move is to add those fields to `ParticipantRef`, which the
Notebook row already uses.

**Decision.** A separate `ParticipantDetail`, returned only by `GET /meetings/{id}`.

`ParticipantRef` exists to render an avatar in a group and deliberately carries nothing else. A
Notebook page holds twenty rows with up to five participants each — widening it would ship
attendance data for a hundred people nobody looks at, on every page load. That is the same weight
ADR-032 removed from the list query, arriving from the other direction.

**Consequences.** Two shapes for one concept, which is a real cost in a codebase this size. It is
the right cost: the split is exactly where the payload sizes diverge, and a test asserts the light
row still does not carry `talk_seconds`.

The talk-time bar uses the SERVER's `color_index` rather than re-hashing the name, because the
server's assignment is authoritative (ADR-013) — re-hashing here would give the same person two
different colours depending on which component drew them.

---

## ADR-046 · A meeting without a summary is 200, not 404

**Date:** 2026-07-27 · **Task:** T-15.5 · **Status:** Accepted

**Context.** `GET /meetings/{id}/summary` had to be added — only the regenerate endpoint existed, so
the drawer's overview silently never loaded. The question was what an unsummarised meeting answers.

**Decision.** 200 with `overview: null`.

"Not summarised yet" is a state of the meeting, not a missing resource. A 404 would make every
client treat a perfectly normal meeting as an error — retry logic, error toasts, an error boundary —
for a condition that is expected and temporary.

**Consequences.** Callers check the field rather than the status. This mirrors ADR-014's reasoning
about 410 versus 404: the status code should describe what happened, and the client's behaviour
should follow from that rather than from a guess.

---

## ADR-047 · One StateView, four variants, four sets of copy

**Date:** 2026-07-27 · **Task:** T-16.12 · **Status:** Accepted

**Context.** Empty, no-matches, no-results, error and offline had each been written where they were
needed. That is how four different situations quietly collapse into one "No data" screen — which
PLAN.md puts on the do-not-ship list, and rightly: the user's NEXT ACTION differs in each case. With
no meetings they need to create one; with a filter on they need to relax it; with a search term they
need to change it; with a failed request they need to retry.

**Decision.** One `StateView` driven by a variant, with the copy and the call to action supplied per
use.

The visual language cannot drift because there is one component; the messages cannot merge because
they are arguments. The filtered-empty state also ECHOES the active filters, so the user can see
which one to relax rather than clearing everything to find out.

**Consequences.** A test asserts the three empty variants produce different text, which is the
property that actually matters and the one most likely to erode.

---

## ADR-048 · Playwright glob `?` is a wildcard, and it cost an hour

**Date:** 2026-07-27 · **Task:** T-16 · **Status:** Accepted

**Context.** Three T-16 tests failed in ways that pointed at the app: the empty state "not
rendering", the error state "not appearing". The page was in fact showing "Something went wrong".

`page.route('**/api/v1/meetings?*')` looks like "the meetings list with a query string". In
Playwright's glob syntax `?` is a SINGLE-CHARACTER WILDCARD, so it also matches
`/api/v1/meetings/facets`. Every one of those tests was stubbing or failing the facets request too.

**Decision.** Route interception uses a URL predicate — `(url) => url.pathname === '/api/v1/meetings'`
— wherever the distinction matters.

**Consequences.** Two real product bugs were hiding behind the misdirection and are fixed:

`Button asChild` threw. Radix's `Slot` clones a single child, and the component renders three slots
(leading, children, trailing); two being `undefined` still counts as three, so every
`<Button asChild>` crashed into the route error boundary. It now renders children alone when
`asChild`, since a consumer in that mode composes its own icons.

The loading skeleton did not reserve the date-group headings the real list has, so the first row
jumped ~30px when data landed — exactly the shift a skeleton exists to prevent.

A third fix was to a TEST rather than the app: T16-D failed only its first request, but the query
client retries a retryable error once, so the automatic retry succeeded and the error state never
appeared. It was asserting against a recovery it had itself made possible.

---

## ADR-049 · Alembic autogenerate must not see the FTS5 shadow tables

**Date:** 2026-07-27 · **Task:** T-17 · **Status:** Accepted

**Context.** Adding one boolean column to `summaries` produced a migration whose `upgrade()` began:

```python
op.drop_table('transcript_fts_data')
op.drop_table('transcript_fts')
op.drop_table('transcript_fts_docsize')
op.drop_table('transcript_fts_idx')
op.drop_table('transcript_fts_content')
op.drop_table('transcript_fts_config')
```

FTS5 creates five shadow tables alongside the virtual table. No model declares any of them — they
are made by a hand-written migration and maintained by triggers — so autogenerate reads six tables
as "in the database, absent from the metadata" and proposes dropping them.

Applying that would have **destroyed search on the next deploy**, silently: the endpoint would keep
answering 200 with an empty result set.

**Decision.** `alembic/env.py` passes an `include_object` hook that excludes anything named
`transcript_fts*` from autogenerate, and the T-17 migration was hand-written to contain only the
intended column.

**Consequences.** Autogenerate now produces an empty migration when the models match the database,
which is the behaviour that makes it trustworthy — and a *reviewable* diff is what caught this at
all. The generated file was read before it was applied; had it been trusted, the failure would have
surfaced weeks later as "search returns nothing" with no obvious cause.

The general lesson: an autogenerated migration is a PROPOSAL. Anything the ORM does not model —
virtual tables, triggers, views, extensions — is invisible to the comparison and will be proposed
for deletion.

---

## ADR-050 · Regeneration is claimed with a conditional UPDATE

**Date:** 2026-07-27 · **Task:** T-17.8 · **Status:** Accepted

**Context.** T-17.8 asks for regeneration to be idempotent under concurrent calls. Two clicks on
`Regenerate`, or a double-submit, must not run the (eventually expensive) generation twice.

**Decision.**

```sql
UPDATE summaries SET is_generating = 1 WHERE id = ? AND is_generating = 0
```

Exactly one caller sees `rowcount == 1`. The loser returns the CURRENT summary rather than a 409 —
from the user's point of view a regeneration is already happening, which is what they asked for, and
an error the UI has to explain away is worse than the truth.

A `SELECT ... then UPDATE` has a window between the two statements where both callers see "not
generating". That window is wide enough to hit with two clicks; the condition has to be part of the
write.

The flag is released in a `finally`, because a stuck flag makes `Regenerate` permanently do nothing
with no way back.

**Consequences.** A crashed process could still leave the flag set — a real limitation, and the
right fix is a timestamp with a timeout rather than a boolean. Not built, because nothing in this
build takes long enough for it to matter, and it is recorded here rather than discovered later.

---

## ADR-051 · Range requests are the difference between playing and seeking

**Date:** 2026-07-27 · **Task:** T-17.9 · **Status:** Accepted

**Context.** PLAN.md calls this "the single most-missed backend detail in this assignment", and the
reason it gets missed is that the failure is invisible: without `Accept-Ranges` and 206 responses, a
browser can still PLAY the file — it downloads it and starts. Only SEEKING breaks, and it breaks
silently. The scrubber snaps back and no error appears anywhere.

**Decision.** Full single-range support, with the three details that are each individually easy to
get wrong:

- **Ranges are INCLUSIVE at both ends.** `bytes=0-0` is one byte; length is `end - start + 1`. The
  off-by-one produces subtly corrupted audio rather than an error.
- **A suffix range is the LAST n bytes.** `bytes=-500` means the final 500, not the first 500.
- **An open-ended range is capped to a chunk.** Browsers open `bytes=0-` to start playback; serving
  3MB on every seek defeats the point of ranges entirely.

`416` carries `Content-Range: bytes */size` so a client that asked for the impossible can learn the
real length. A malformed `Range` is IGNORED rather than rejected — a client sending nonsense still
gets its file.

**Consequences.** The parsing is a pure function with unit tests covering each of the above, because
every one of them is a place where the code looks right and the behaviour is wrong. Reads are
buffered rather than streamed; the seam for streaming is in `read_range` and the callers do not
change.

---

## Pending decisions

Tracked so they are not silently defaulted. Each becomes an ADR when settled.

| # | Decision | Settle by |
|---|---|---|
| ~~1~~ | ~~Speaker colour authority~~ | ✅ ADR-013 |
| ~~2~~ | ~~FTS5 rows survive a meeting's soft delete~~ | ✅ ADR-014 |
| ~~3~~ | ~~Who composes the five summary sections~~ | ✅ ADR-015 |
| ~~4~~ | ~~`/` welcome screen vs Home dropped from the nav~~ | ✅ T-06 — `/` redirects, Home removed |
| ~~5~~ | ~~Filters panel: draft-then-Apply vs live-apply~~ | ✅ ADR-039 — draft-then-Apply |
| ~~6~~ | ~~Notebook layout: cards vs column table~~ | ✅ ADR-036 — cards, with the plan's testids and behaviour kept |
