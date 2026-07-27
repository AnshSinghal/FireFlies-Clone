# Fireflies.ai Clone

An AI meeting-notetaker: a searchable meetings library, an interactive transcript wired
bidirectionally to a media player, AI-generated summaries and extracted action items.

**Live demo:** _(deployed in T-44)_ · **Repository:** https://github.com/AnshSinghal/FireFlies-Clone

---

## Screenshots

_(Captured in T-45.2: notebook, notepad, dark mode, and a GIF of transcript ↔ player sync.)_

---

## Overview

_(Written in T-45.3 — feature list mapped to the assignment's Core Features with ✅ / 🚧 / ❌
markers, plus a separate bonus table.)_

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router, TypeScript strict) | File-based routing, first-class TS, and `next/font` for self-hosted Inter |
| Styling | Tailwind CSS v3 + CSS custom properties | Tailwind's palette is *replaced* by semantic tokens, so an off-palette colour is a build error — see [ADR-002](docs/decisions.md) |
| Data fetching | TanStack Query v5 | Cache invalidation across notebook / drawer / notepad is the hard part of this app |
| Backend | FastAPI + SQLAlchemy 2.0 + Alembic | Typed request/response models and auto-generated OpenAPI |
| Database | SQLite + FTS5 | The brief specifies SQLite; FTS5 gives real ranked search with no external service |
| AI | Pluggable provider | `MockProvider` (deterministic, offline, default) or a real LLM behind one env var |
| Testing | Playwright + pytest | E2E for the graded interactions, pytest for services, parsers and the AI layer |

---

## Architecture

_(Mermaid diagram added in T-45.5: browser → Next.js → FastAPI → services → SQLAlchemy → SQLite,
with the AI provider as a swappable box.)_

The backend is strictly layered:

```
api/v1/routers/   thin — parse the request, call a service, return a schema
services/         ALL business logic
models/           SQLAlchemy ORM
schemas/          Pydantic — routers never return ORM objects
```

Routers contain no ORM access. This is enforced by `scripts/check_layering.py`, which runs in
`make lint`, the pre-commit hook and CI.

### AI provider (T-29)

Summaries, outlines, keywords, action items and Q&A all go through one interface
(`app/ai/provider.py`) with two implementations:

- **`MockProvider`** — the default (`AI_PROVIDER=mock`). Deterministic classical IR: TF-IDF
  keywords, pause/speaker-turn topic segmentation for the outline, TextRank-style extractive
  overview, regex commitment patterns for action items, term-overlap retrieval for Q&A. Same
  transcript in, byte-identical output out — which is what makes it testable and safe for
  visual-regression snapshots.
- **`LLMProvider`** — OpenAI or Anthropic, selected by `AI_PROVIDER` + `AI_API_KEY`
  (+ optional `AI_MODEL`). Structured output against JSON schemas derived from the same
  pydantic types the rest of the app consumes, so parsing is validation, not regex-on-prose.

Around them: prompts as versioned Markdown files (`app/ai/prompts/`), a response cache keyed on
`hash(transcript + prompt versions + provider)` so identical input never re-bills, and a fallback
chain — any LLM failure (timeout, rate limit, bad key) logs, degrades to the mock, and records
`provider = "mock (llm fallback)"` so the UI's attribution line stays honest. The demo can never
hard-fail because of an API key.

**Chunking strategy for long transcripts (map-reduce).** LLM context is finite and cost scales
with input, so transcripts over ~3,000 tokens are split on segment boundaries into ~3,000-token
chunks with a ~200-token overlap (a commitment made in the last sentence of chunk *N* is the
context for the first sentence of chunk *N+1*). Each chunk is summarised independently (map),
then the chunk summaries are synthesised into one summary with the same prompt (reduce); notes
keep the mapped, transcript-grounded versions. List-shaped extractions merge instead: keywords by
max weight, outline entries by strictly-increasing timestamp (which also dedupes the overlap
region), action items by normalised text. Q&A retrieves the single most relevant chunk
client-side before asking. A token pre-check refuses absurd inputs (~350k tokens) before they
cost money. The mock path doesn't need any of this, but the seam is where a real model plugs in.

---

## Database Schema

SQLite with FTS5. Full ERD, per-column rationale and the design decisions behind it are in
**[docs/schema.md](docs/schema.md)**.

| Table | Purpose | Notable |
|---|---|---|
| `users` | Accounts | Auth is out of scope; the table exists so authorship is a real FK |
| `meetings` | Aggregate root | Soft-deleted via `deleted_at`; `duration_seconds` denormalised |
| `participants` | Attendance, per meeting | `user_id` nullable — most attendees have no account |
| `speakers` | Raw transcript labels | Decouples `Speaker 1` from a person, so renaming is one UPDATE |
| `transcript_segments` | One speaker turn | `start_ms`/`end_ms` INTEGER milliseconds; ~1,200 rows for a long meeting |
| `summaries` | Scalar summary fields | One per meeting; carries provider provenance and an `is_stale` flag |
| `summary_sections` | Outline chapters, note groups | `start_ms` is what makes the outline clickable |
| `action_items` | Tasks | First-class rows, not a JSON blob — independently mutable |
| `keywords` | Salient terms | Weighted, so the UI's top-six ordering is meaningful |
| `channels`, `tags`, `meeting_tags` | Organisation | One channel per meeting, many tags |
| `comments`, `highlights`, `bookmarks`, `soundbites` | Collaboration (Phase 6) | Created up front so the schema is stable |
| `transcript_fts` | FTS5 virtual table | Trigger-maintained; gives ranked search instead of `LIKE '%x%'` |

**Design decisions worth knowing:**

- **Soft delete.** Deleting a meeting sets `deleted_at`. It vanishes from the UI but stays
  restorable, which is what makes the undo affordance honest rather than a re-created lesser copy.
- **Two denormalised columns**, both justified by the same access pattern: `meetings.duration_seconds`
  and `participants.talk_seconds` would otherwise mean an aggregate over hundreds of segments for
  every row of every Notebook page.
- **`speakers` sits between segments and people** so renaming a speaker is one statement rather than
  one per segment, and a speaker can stay unresolved indefinitely.
- **Milliseconds are integers**, never formatted strings — the transcript↔player sync depends on
  exact comparisons.
- **The FTS index survives a soft delete**, so all search goes through `app/db/search.py`, which
  joins back to `meetings` and filters. Asserted from both sides in `tests/test_schema.py`.

Migrations are in `backend/alembic/versions/` and are committed — the app never calls
`create_all()`. Apply them with `make migrate`.

---

## API Overview

Full endpoint table, conventions and worked examples: **[docs/api.md](docs/api.md)**.
Interactive docs at **`/docs`** on the running backend.

Every list endpoint returns the same envelope, and every error — including FastAPI's own 404 on an
unknown route — returns `{ error: { code, message, details } }`. Branch on `code`; it is stable.

```bash
curl localhost:8000/api/v1/meetings          # paginated, light row shape
curl localhost:8000/api/v1/meetings/1        # 404 unknown · 410 deleted (restorable)
curl localhost:8000/api/health               # runs a real SELECT 1; 503 when the DB is down
```

The TypeScript client at `frontend/src/types/api.d.ts` is generated from the schema — run
`make types` after changing an endpoint, so a backend field rename surfaces as a frontend type error
rather than a runtime `undefined`. A test fails the build if the committed schema falls behind.

---

## Setup

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Docker + Compose | 24+ / v2+ | The one-command path |
| Node.js | 20+ | Manual path, and the E2E suite |
| Python | 3.12+ | Manual path |
| [uv](https://docs.astral.sh/uv/) | latest | Manual path (Python deps) |

### Quick start (Docker)

```bash
git clone https://github.com/AnshSinghal/FireFlies-Clone.git
cd FireFlies-Clone
cp .env.example .env
make dev
```

Frontend on http://localhost:3000 · API on http://localhost:8000 · API docs on
http://localhost:8000/docs

Populate the database with realistic demo data:

```bash
make seed-demo    # reset, seed, validate, and print a summary
```

Eight meetings with genuine transcripts — 607 segments, 38 action items across every badge state,
15 people, dated from today back to two months ago so every date filter has data on both sides.
Timings, durations and talk-time are **derived from the transcripts**, never authored, so nothing in
the seed can contradict itself.

### Manual (no Docker)

```bash
cp .env.example .env

# Backend — http://localhost:8000
cd backend && uv sync && uv run uvicorn app.main:app --reload

# Frontend — http://localhost:3000 (separate terminal)
cd frontend && npm install && npm run dev
```

### Commands

| Command | Does |
|---|---|
| `make dev` | Both apps via Docker Compose |
| `make seed` | Reset and populate the demo database |
| `make test` | Backend test suite (pytest) |
| `make e2e` | Playwright end-to-end suite |
| `make lint` | Lint + typecheck both apps and check backend layering |
| `make format` | Auto-format both apps |

---

## Assumptions & Scope

_(Expanded in T-45.9.)_ Known scope boundaries, all deliberate:

- **Authentication is out of scope** per the assignment. A single seeded default user is returned by
  a `get_current_user` dependency — the one place real auth would be wired in.
- **Speech-to-text is out of scope.** Transcripts are uploaded or pasted, not generated from audio.
- **Summaries default to a deterministic offline provider**, not a live LLM, so the demo cannot fail
  on a missing API key or a rate limit. Switching to a real model is a one-variable change.
- **Deletes are soft.** Meetings disappear from the UI but remain restorable.

---

## Testing

_(Counts and coverage added in T-45.10.)_

```bash
make test        # Backend suite (pytest)
make e2e         # End-to-end suite (Playwright)
make lint        # Both apps' linters + the backend layering check
make typecheck   # mypy --strict and tsc --noEmit
```

Playwright starts its own copies of both apps on ports **3100/8100**, so `make dev` can stay running
on 3000/8000 while the suite executes, and a run can never accidentally test whatever else happens to
be listening. Override with `E2E_FRONTEND_PORT` / `E2E_BACKEND_PORT`.

First run needs the browser binaries:

```bash
cd e2e && npm install && npx playwright install chromium
```

---

## Project Structure

```
├─ frontend/          Next.js app (App Router, TypeScript)
├─ backend/           FastAPI service, layered routers → services → models
├─ e2e/               Playwright suite, owns its own package.json
├─ docs/              ADR log, schema and API documentation
├─ scripts/           Repo-level checks (layering enforcement)
├─ design.md          Design tokens and layout reference
├─ PLAN.md            Full implementation plan (46 tasks)
└─ docker-compose.yml
```

---

## What I'd Do Next

_(Written in T-45.12.)_
