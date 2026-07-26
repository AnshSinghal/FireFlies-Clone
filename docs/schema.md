# Database Schema

SQLite + FTS5. Entity-relationship diagram, the reasoning behind each non-obvious choice, and the
two design problems found while drawing it.

---

## ERD

```mermaid
erDiagram
    users ||--o{ meetings : hosts
    users ||--o{ participants : "may resolve to"
    users ||--o{ comments : authors
    users ||--o{ highlights : creates
    users ||--o{ soundbites : creates

    channels ||--o{ meetings : contains

    meetings ||--o{ participants : has
    meetings ||--o{ speakers : has
    meetings ||--o{ transcript_segments : has
    meetings ||--|| summaries : has
    meetings ||--o{ keywords : has
    meetings ||--o{ action_items : has
    meetings ||--o{ comments : has
    meetings ||--o{ highlights : has
    meetings ||--o{ soundbites : has
    meetings }o--o{ tags : "tagged with"

    participants ||--o| speakers : "resolved to"
    participants ||--o{ action_items : "assigned"

    speakers ||--o{ transcript_segments : speaks

    transcript_segments ||--o{ comments : "anchored to"
    transcript_segments ||--o{ highlights : "anchored to"

    summaries ||--o{ summary_sections : contains

    users {
        int id PK
        string name
        string email UK
        string avatar_url
        datetime created_at
    }

    meetings {
        int id PK
        string title
        text description
        datetime started_at "indexed DESC — default sort"
        int duration_seconds "DENORMALISED"
        int host_id FK
        string media_url
        enum media_type "audio|video|none"
        string language
        enum source "upload|manual|seed|integration"
        enum visibility "private|team|public"
        int channel_id FK "nullable"
        enum processing_status "pending|processing|ready|failed"
        datetime created_at
        datetime updated_at
        datetime deleted_at "nullable — SOFT DELETE"
    }

    participants {
        int id PK
        int meeting_id FK
        int user_id FK "nullable — external attendees have no account"
        string display_name
        string email
        enum role "host|attendee|invited"
        bool attended
        int talk_seconds "DENORMALISED"
    }

    speakers {
        int id PK
        int meeting_id FK
        string label "raw transcript label, e.g. 'Speaker 1'"
        int participant_id FK "nullable until resolved"
        int color_index "0-7, authoritative"
    }

    transcript_segments {
        int id PK
        int meeting_id FK
        int speaker_id FK
        int start_ms "INT milliseconds, never a string"
        int end_ms
        text text
        int sequence "UNIQUE per meeting"
        real confidence
        bool is_edited
        text original_text "nullable — set on first edit"
    }

    summaries {
        int id PK
        int meeting_id FK UK
        text overview
        text gist
        string provider
        string model
        datetime generated_at
        bool is_stale
    }

    summary_sections {
        int id PK
        int summary_id FK
        enum kind "outline|notes"
        string title
        text body
        int start_ms "nullable — outline entries only"
        int sequence
    }

    action_items {
        int id PK
        int meeting_id FK
        text text
        int assignee_participant_id FK "nullable"
        date due_date
        enum status "open|completed"
        datetime completed_at
        enum source "ai|manual"
        int start_ms "nullable — traceability to the moment"
        int sequence
    }

    keywords {
        int id PK
        int meeting_id FK
        string term
        real weight
    }
```

Bonus-feature tables (`comments`, `highlights`, `soundbites`, `tags`, `channels`) are created up
front so the schema is stable, even though the features land in Phase 6. Adding a table later is
easy; migrating one whose shape was never considered is not.

---

## Two problems found while drawing this

PLAN.md T-03.1 predicts that drawing the ERD before writing models surfaces mistakes. It did.

### 1 · `summaries` and `summary_sections` overlapped

The plan gives `summaries` an `overview TEXT` and a `bullet_notes JSON` column, **and** gives
`summary_sections` a `kind` enum of `('overview','outline','notes','keywords')`. So the overview has
two homes, the notes have two homes, and keywords have three — there is also a dedicated `keywords`
table. Nothing says which wins, which is how a summary ends up rendering stale content that another
code path updated.

**Resolution.** One home each:

| Content | Lives in | Why |
|---|---|---|
| Overview paragraph | `summaries.overview` | Exactly one per meeting — a scalar, not a collection |
| Meeting outline | `summary_sections` where `kind='outline'` | Repeating, ordered, each carries `start_ms` |
| Bullet notes | `summary_sections` where `kind='notes'` | Repeating, grouped under an outline chapter |
| Keywords | `keywords` | Already relational, and carries a `weight` for ranking |
| Action items | `action_items` | Independently mutable — users check them off |

`bullet_notes JSON` is dropped, and the `kind` enum narrows to `('outline','notes')`. A JSON blob
could not be queried, ordered, or partially updated, which is the whole reason the rest of the
schema is relational.

The five canonical UI sections (design.md §2.4) are therefore **composed by the API**, not stored as
five rows — resolving open decision #3 from T-01.

### 2 · The FTS index survives a soft delete

`transcript_fts` is kept in sync by triggers on `transcript_segments`. Soft-deleting a *meeting*
sets `meetings.deleted_at` and never touches its segments — so the segments stay in the FTS index
and **global search returns hits from deleted meetings**. PLAN.md's T-35 test cases do not cover
this.

**Resolution.** Any FTS query must join back to `meetings` and filter `deleted_at IS NULL`. That is
enforced in one place, `app/db/search.py::search_segments`, rather than left to each caller, and
`tests/test_schema.py` asserts both halves: that the raw index still contains the row, and that the
helper does not return it. Cascading the soft delete into the segments was rejected — it would make
restore lossy and turn one UPDATE into thousands.

---

## Design decisions

### Soft delete

`meetings.deleted_at` rather than a hard `DELETE`. Deleted meetings vanish from the UI but remain
restorable, which is what makes the 6-second `Undo` toast in T-09.4 honest rather than a lie that
re-creates a lesser copy. The filter is applied by `Meeting.not_deleted()` so it cannot be forgotten
at a call site.

### Deliberate denormalisation

Two computed values are stored rather than aggregated on read. Both are justified by the same access
pattern: the Notebook list renders 20 meetings per page, and each would otherwise need an aggregate
over its segments.

| Column | Instead of | Why |
|---|---|---|
| `meetings.duration_seconds` | `MAX(transcript_segments.end_ms)` | 20 aggregates over ~400 rows each, per page render |
| `participants.talk_seconds` | `SUM(end_ms - start_ms)` grouped by speaker | Same, plus it powers the talk-time bars in the details drawer |

Both are recomputed by the writer (the seeder and the upload parser), never by the reader. The
staleness risk is real and accepted: nothing mutates segment timings after ingest except a text
edit, which does not change `start_ms`/`end_ms`.

### The `speakers` indirection

A transcript arrives with labels like `Speaker 1`, not people. `speakers` sits between
`transcript_segments` and `participants` so that:

- segments reference a stable speaker row, and renaming `Speaker 1` → `Priya Raman` is **one UPDATE**
  rather than one per segment (T-25.7);
- a speaker can stay unresolved (`participant_id IS NULL`) without blocking anything;
- two labels can later be merged onto one participant.

`color_index` is stored here and is **authoritative** — resolving open decision #1 from T-01. It is
computed once at ingest by hashing the speaker label, using the same FNV-1a algorithm as the
frontend's `getSpeakerColor`. The frontend reads the stored index for persisted speakers and only
hashes locally for previews of not-yet-saved transcripts.

### Milliseconds as integers

`start_ms` / `end_ms` are `INTEGER` milliseconds everywhere internally. Never `"00:04:32"`, never a
float. Formatting happens once, at the presentation edge. This makes the binary search in T-21.3
exact and comparisons trivially correct.

### Indexes

| Index | Serves |
|---|---|
| `ix_segments_meeting_start (meeting_id, start_ms)` | The transcript window query and the active-segment lookup |
| `uq_segments_meeting_sequence (meeting_id, sequence)` | Ordering integrity — a duplicate sequence is a corrupt transcript |
| `ix_meetings_started_at (started_at DESC)` | The Notebook's default sort |
| `ix_meetings_deleted_at (deleted_at)` | The soft-delete filter on every list query |
| `ix_meetings_host_id`, `ix_meetings_channel_id` | Filter facets |
| `uq_participants_meeting_name (meeting_id, display_name)` | One row per person per meeting |
| `uq_speakers_meeting_label (meeting_id, label)` | One row per transcript label |
| `uq_keywords_meeting_term (meeting_id, term)` | No duplicate terms |

### Constraint naming convention

`Base.metadata` carries an explicit `naming_convention`. Without it SQLite produces anonymous
constraints, and Alembic's batch mode — which recreates a table to alter it, because SQLite cannot
`ALTER COLUMN` — has nothing to reference. Migrations then fail to downgrade. This is cheap to set
up now and painful to retrofit.

### What is *not* enforced by a foreign key

`action_items.assignee_participant_id` points at a participant, but nothing at the database level
guarantees that participant belongs to the *same* meeting. Expressing that needs a composite foreign
key against `(meeting_id, id)`, which means a composite unique key on `participants` purely to
satisfy it. The invariant is enforced in the service layer instead, and asserted in tests. Noted
here because it is exactly the sort of thing worth being able to answer for.
