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

---

## Database Schema

_(ERD + per-entity tables added in T-03.13 / T-45.6.)_

---

## API Overview

_(Endpoint table added in T-04.13. Interactive docs are served at `/docs` on the running backend.)_

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
make seed
```

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
