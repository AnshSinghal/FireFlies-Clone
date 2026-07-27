# API

Base URL `/api/v1`. Interactive docs at **`/docs`** on the running backend; the machine-readable
schema is committed at [`openapi.json`](openapi.json) and drives the generated TypeScript client at
`frontend/src/types/api.d.ts`.

> Regenerate both with `make types` after changing an endpoint. `tests/test_openapi_drift.py` fails
> the build if the committed schema falls behind, because the whole value of the generated client is
> that a backend rename becomes a frontend *type error* rather than a runtime `undefined`.

---

## Conventions

**Every list endpoint** returns the same envelope. A client writes the unwrapping code once:

```json
{ "items": [], "page": 1, "page_size": 20, "total": 47, "total_pages": 3, "has_next": true }
```

**Every error** — including FastAPI's own 404 on an unknown route — returns:

```json
{ "error": { "code": "MEETING_NOT_FOUND", "message": "Meeting not found.", "details": {} } }
```

Branch on `code`. It is stable and machine-readable; `message` is for humans and will be reworded.
`details` carries field-level errors keyed by dotted path (`participants.0.email`) on a 422.

**Other rules**

| | |
|---|---|
| Times | UTC ISO-8601 |
| Positions in a recording | Integer **milliseconds** (`start_ms`), never `"00:04:32"` |
| `page_size` | Clamped to 100, not rejected — asking for 500 gets you 100 |
| Deleted meetings | **410 Gone**, not 404 — they are restorable and the client can offer that |
| Request tracing | Every response carries `X-Request-ID`; an inbound one is preserved |
| Rate limits | Only the AI endpoints (10/min). Listing is unlimited |

---

## Endpoints

All 38 paths below are implemented and serving. This table was stale until
2026-07-28: it split them into "Core ✅" and **"Frozen contract, later
tasks 🚧"**, with transcript, summary, action-items, search and the whole of
Phase 6 sitting in the second group. Every one of those had shipped. A reader
would have concluded the project was roughly a third built.

Generated from the deployment's own `/openapi.json`, not written by hand, so it
cannot drift the same way again — and `tests/test_openapi_drift.py` already
fails the build if the committed schema falls behind the code.

### Meetings

| Method | Path |
|---|---|
| `GET` `POST` | `/api/v1/meetings` |
| `GET` `PATCH` `DELETE` | `/api/v1/meetings/{id}` |
| `POST` | `/api/v1/meetings/{id}/restore` |
| `POST` | `/api/v1/meetings/bulk-delete` · `/api/v1/meetings/bulk-restore` |
| `GET` | `/api/v1/meetings/facets` |
| `POST` | `/api/v1/meetings/parse` · `/api/v1/meetings/import` |
| `GET` | `/api/v1/meetings/export` · `/api/v1/meetings/{id}/export` |

### Transcript, speakers, media

| Method | Path |
|---|---|
| `GET` | `/api/v1/meetings/{id}/transcript` (cursor-paged) |
| `PATCH` | `/api/v1/meetings/segments/{segment_id}` |
| `GET` `POST` | `/api/v1/meetings/{id}/speakers` |
| `PATCH` | `/api/v1/meetings/speakers/{speaker_id}` |
| `GET` | `/api/v1/meetings/{id}/media` (HTTP Range) |

### Summary, action items, AI

| Method | Path |
|---|---|
| `GET` | `/api/v1/meetings/{id}/summary` |
| `POST` | `/api/v1/meetings/{id}/summary/regenerate` |
| `GET` `POST` | `/api/v1/meetings/{id}/action-items` |
| `PATCH` `DELETE` | `/api/v1/meetings/action-items/{item_id}` |
| `POST` | `/api/v1/meetings/{id}/ask` |

### Annotation (Phase 6)

| Method | Path |
|---|---|
| `GET` `POST` | `/api/v1/meetings/{id}/comments` |
| `PATCH` `DELETE` | `/api/v1/comments/{comment_id}` |
| `GET` `POST` | `/api/v1/meetings/{id}/highlights` |
| `PATCH` `DELETE` | `/api/v1/highlights/{highlight_id}` |
| `GET` | `/api/v1/meetings/{id}/bookmarks` |
| `PUT` `DELETE` | `/api/v1/meetings/{id}/bookmarks/{segment_id}` |
| `GET` `POST` | `/api/v1/meetings/{id}/soundbites` |
| `GET` | `/api/v1/meetings/{id}/soundbites/proposals` |
| `DELETE` | `/api/v1/soundbites/{soundbite_id}` |

### Organisation and search

| Method | Path |
|---|---|
| `GET` `POST` | `/api/v1/tags` |
| `PATCH` `DELETE` | `/api/v1/tags/{tag_id}` |
| `PUT` | `/api/v1/meetings/{id}/tags` |
| `GET` | `/api/v1/meetings/{id}/tags/proposals` |
| `GET` | `/api/v1/channels` |
| `GET` | `/api/v1/search` |

### Identity and health

| Method | Path |
|---|---|
| `GET` | `/api/health` — runs a real `SELECT 1`; **503** when the DB is unreachable |
| `GET` | `/api/v1/me` — the seeded default user; auth is out of scope |
| `GET` | `/api/v1/users` |

---

## Examples

### List meetings

```http
GET /api/v1/meetings?page=1&page_size=2&sort=-started_at
```

```json
{
  "items": [
    {
      "id": 1,
      "title": "Q3 Product Roadmap Sync",
      "started_at": "2026-07-24T10:00:00Z",
      "duration_seconds": 2538,
      "host": { "id": 1, "name": "Sarah Chen", "avatar_url": null },
      "participants": [{ "id": 1, "display_name": "Sarah Chen", "avatar_url": null }],
      "participant_count": 6,
      "action_item_counts": { "open": 4, "completed": 2 },
      "keywords": ["pricing", "churn", "API limits"],
      "tags": [],
      "overview_preview": "The team reviewed Q3 progress, focusing on the pricing…",
      "has_media": true,
      "media_type": "audio"
    }
  ],
  "page": 1,
  "page_size": 2,
  "total": 8,
  "total_pages": 4,
  "has_next": true
}
```

Note what is **absent**: no transcript, no full summary, no action-item bodies. Those would be
~1,200 segments per row, twenty rows per page. The heavy shape is a separate endpoint.

### Create a meeting

```http
POST /api/v1/meetings
Content-Type: application/json

{ "title": "Bug Triage — Payments", "participant_names": ["Sarah Chen", "Marcus Patel"] }
```

`201` with the `MeetingDetail` shape. A blank or whitespace-only title is rejected:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request payload is invalid.",
    "details": { "title": "Value error, Title cannot be blank." }
  }
}
```

### Fetch a deleted meeting

```http
GET /api/v1/meetings/3
```

```json
{
  "error": {
    "code": "MEETING_DELETED",
    "message": "This meeting was deleted. It can be restored.",
    "details": { "meeting_id": 3 }
  }
}
```

`410`, not `404`. The distinction is what lets the UI offer "Restore" instead of a dead end.

---

## Status codes

| Code | When |
|---|---|
| `200` | Success |
| `201` | Created |
| `204` | Deleted, no body |
| `404` | `NOT_FOUND` / `MEETING_NOT_FOUND` — never existed |
| `410` | `MEETING_DELETED` — soft-deleted, restorable |
| `422` | `VALIDATION_ERROR` — with `details` keyed by field path |
| `429` | `RATE_LIMITED` — AI endpoints only |
| `500` | `INTERNAL_ERROR` — generic message, `request_id` in `details`, traceback in logs only |
| `503` | `SERVICE_UNAVAILABLE` / `NOT_SEEDED` — dependency down, or the database has no users yet |
