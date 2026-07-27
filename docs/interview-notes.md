# Interview notes (T-46.11)

Answers to the questions this build invites, with the file to open while
answering. `docs/decisions.md` is the long form — 138 ADRs written as the
choices were made; this is the short form for the seven most likely questions.

## 1 · Why this schema?

`docs/schema.md`, `backend/app/models/`.

Three decisions carry the rest:

- **Durations are INT milliseconds** (`start_ms`/`end_ms`), never `"00:04:32"`.
  Formatting happens at the presentation edge. A stored string cannot be
  compared, summed, or seeked to, and every feature that came later —
  transcript↔player sync, soundbite ranges, seekbar markers — is arithmetic on
  those integers.
- **Speakers are an indirection, not a string on the segment.** A meeting has
  speakers; segments point at one. Renaming a speaker is one UPDATE rather
  than a scan, and speaker colour has somewhere to live (`color_index`,
  ADR-013: the DB is authoritative, the name hash is the fallback).
- **Soft delete on meetings, hard delete where nothing references the row.**
  Meetings carry `deleted_at` because delete-and-undo is a specced flow;
  soundbites hard-delete because a clip is a pointer into a transcript that
  two integers recreate (ADR-122). The contrast is deliberate — comments
  needed tombstones because replies hang off parents.

The FTS5 trap worth volunteering: triggers fire on `transcript_segments`, so
soft-deleting a *meeting* does not touch its segments. Global search joins back
to `meetings` and filters `deleted_at IS NULL`, or deleted meetings surface in
results (ADR-014).

## 2 · How would you swap SQLite for Postgres?

Most of it is the URL. What actually needs work:

- **FTS5 is SQLite-specific.** Global search would move to `tsvector` +
  `ts_rank`, or to pgvector if the goal is semantic rather than lexical. The
  search service is one module, and `EXPLAIN QUERY PLAN` is asserted in a test
  (T-43.9) precisely so a rewrite has a bar to clear.
- **The `lower(name)` functional unique index** on tags (ADR-125) is portable;
  the `PRAGMA` block (WAL, `foreign_keys=ON`, `busy_timeout`) is not, and
  Postgres needs none of it.
- **Connection pooling becomes real.** The single-instance in-memory rate
  limiter (`core/rate_limit.py`) is already flagged in-file as needing Redis
  the moment there is more than one process — same for any per-instance state.

## 3 · Why virtualise the transcript?

`features/notepad/transcript/transcript-list.tsx`.

A 4-hour meeting is ~5,000 segments; T-42.11 seeds exactly that as a stress
case. Without windowing, every clock tick re-renders thousands of rows and the
sync feature — the most graded interaction — is what degrades first.

`@tanstack/react-virtual`, `overscan: 10`, `estimateSize` replaced by
`measureElement` because segments run one line to six. The subtlety worth
raising: `initialOffset` tells the virtualiser which rows to *render*, not
where to *scroll* — assume otherwise and the DOM sits at the top with correct
rows drawn below the fold, silently losing every remembered position.

## 4 · How does player↔transcript sync avoid re-render storms?

`lib/player/use-player.ts`, `player-context.tsx`, `transcript-list.tsx`.

The clock ticks at 100ms. If every tick re-rendered the list, a 5,000-row
transcript would spend its life in reconciliation. Three defences:

- **Position lives in a ref** (`positionRef`), not only in state, so logic that
  needs the current time does not force a render to read it.
- **`SegmentRow` is memoised by hand with an explicit comparator** (T-20.13).
  The list component deliberately is *not* memoised — the virtualiser returns
  fresh function identities every render by design, and memoising around them
  serves stale measurements. The rows are the many; the list is the one.
- **Auto-scroll keys on the active row INDEX, not on `currentMs`.** Scrolling
  every tick would fight the user's own scrolling.

Range-locked playback (soundbites) is enforced *in that same tick* rather than
with `setTimeout` (ADR-123) — a timer drifts the moment the rate changes, the
media stalls, or the user pauses mid-clip.

## 5 · How would you add real speech-to-text?

The provider abstraction already exists for summaries (`app/ai/`): an ABC,
`MockProvider` (deterministic, the default), `LLMProvider`, and wrappers for
fallback and caching. STT is the same shape one layer earlier:
`TranscriptionProvider.transcribe(media) -> segments`, with Whisper behind it.

Two things make it non-trivial and are worth saying out loud: transcription is
minutes-long, so it needs a job queue and a status the UI can poll — the
existing `processing` meeting state is where that would surface — and
diarisation output has to map onto the `speakers` table rather than inventing
per-segment strings.

## 6 · Where were the N+1s, and how did you find them?

`backend/tests/test_query_budget.py`, `conftest.py:129`.

Found by instrumenting rather than by reading: `assert_max_queries(n)` counts
statements around a request. The list and detail routes are pinned at
`LIST_BUDGET = 11` and `DETAIL_BUDGET = 9`, each with the measured floor in a
comment. The guard earns its keep on *every later feature* — adding tags to
list rows or comment counts to detail had to prove it did not add a query per
row, and the budget is the thing that makes "it feels fast" falsifiable.

## 7 · What would you refactor with another week?

- **Retire the two duplicate spec-number prefixes** and the flat spec layout in
  favour of the POM-per-suite pattern `e2e/pages/` already establishes — the
  POMs currently serve new suites only (ADR-112), which is a deliberate
  half-measure.
- **A database per Playwright worker.** The read-only/mutations split contains
  write races today, and the mutations project runs single-worker because
  files raced each other (60/61 vs 61/61 — measured). Per-worker databases
  would let writers parallelise, at the cost of a backend process each.
- **Lift the export palette back to a generated artifact.** `export/palette.py`
  copies resolved token values because a PDF cannot read CSS custom properties
  (ADR-105); generating it from `tokens.css` at build time would remove the one
  sanctioned place where a hex code lives outside the token layer.
- **Revisit `formatMeetingMeta`.** Rows show `7:13` where Fireflies shows
  `30 min` (`docs/ui-audit.md`, item 1) — kept for consistency with the player
  clock, but it is a defensible thing to change if the evaluator disagrees.

## Things I would rather be asked

- Why the mutations project runs one worker (three "feature bugs" that were
  scheduling: `90-mutations` deleting meetings under `27-tags`).
- Why the selection toolbar clamps and flips (it is `position: fixed` on the
  selection rect; unclamped it leaves the viewport, and no amount of scrolling
  reaches a fixed element).
- Why `dangerouslySetInnerHTML` appears exactly once (the pre-paint theme boot
  script — constant markup, and without it every load flashes white).
