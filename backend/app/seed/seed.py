"""Demo data seeder.

The highest-leverage code in the project: it is what the evaluator sees three
seconds after opening the demo. Fixtures live in `data/` as JSON carrying only a
speaker and a line; everything derivable — timings, durations, talk time,
speaker colours — is COMPUTED here (T-05.10), so the data cannot contradict
itself.

Idempotent by default: meetings upsert on `seed_key`, so running it twice
produces eight meetings rather than sixteen. `--reset` wipes and rebuilds.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any

from sqlalchemy import delete, func, select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import (
    ActionItem,
    Channel,
    Keyword,
    Meeting,
    Participant,
    Speaker,
    Summary,
    SummarySection,
    Tag,
    TranscriptSegment,
    User,
)
from app.models.enums import (
    ActionItemSource,
    ActionItemStatus,
    MediaType,
    MeetingSource,
    ParticipantRole,
    SummarySectionKind,
    Visibility,
)
from app.seed.avatars import avatar_url, color_index, write_avatars
from app.seed.timing import assert_well_formed, build_timeline, talk_time_by_speaker

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

DATA_DIR = Path(__file__).parent / "data"
MEETINGS_DIR = DATA_DIR / "meetings"
AVATAR_DIR = Path(__file__).resolve().parents[3] / "frontend" / "public" / "avatars"


@dataclass
class SeedStats:
    users: int = 0
    meetings: int = 0
    segments: int = 0
    action_items: int = 0
    keywords: int = 0
    avatars: int = 0

    def render(self) -> str:
        return (
            f"{self.meetings} meetings · {self.segments:,} segments · "
            f"{self.action_items} action items · {self.keywords} keywords · "
            f"{self.users} users · {self.avatars} avatars"
        )


def _anchor() -> datetime:
    """The 'now' that relative seed dates are measured from.

    Configurable because Playwright pins its clock (T-39.6) and the seed dates
    must agree with it — otherwise a `Today` assertion passes on the day it was
    written and fails every day after. Falls back to the real clock so a local
    `make seed` still produces meetings dated today.
    """
    raw = get_settings().seed_anchor_date.strip()
    if not raw:
        return datetime.now(UTC)
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def _load(path: Path) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return data


# ── Reference data ──────────────────────────────────────────────────────────


def _seed_cast(db: Session, stats: SeedStats) -> dict[str, User]:
    cast = _load(DATA_DIR / "cast.json")
    people = [*cast["users"], *cast["externals"]]

    stats.avatars = write_avatars({p["slug"]: p["name"] for p in people}, AVATAR_DIR)

    users: dict[str, User] = {}
    for person in people:
        user = db.execute(select(User).where(User.email == person["email"])).scalar_one_or_none()
        if user is None:
            user = User(name=person["name"], email=person["email"])
            db.add(user)
        # Set on every run so a changed avatar scheme propagates without --reset.
        user.avatar_url = avatar_url(person["slug"])
        users[person["slug"]] = user

    db.flush()
    stats.users = len(users)

    for spec in cast["channels"]:
        channel = db.execute(
            select(Channel).where(Channel.slug == spec["slug"])
        ).scalar_one_or_none()
        if channel is None:
            db.add(
                Channel(
                    name=spec["name"],
                    slug=spec["slug"],
                    is_private=spec["is_private"],
                    icon=spec["icon"],
                )
            )

    for spec in cast["tags"]:
        tag = db.execute(select(Tag).where(Tag.name == spec["name"])).scalar_one_or_none()
        if tag is None:
            db.add(Tag(name=spec["name"], color=spec["color"]))

    db.flush()
    return users


# ── Meetings ────────────────────────────────────────────────────────────────


def _clear_meeting_children(db: Session, meeting: Meeting) -> None:
    """Remove everything owned by a meeting before rebuilding it.

    Upserting a transcript in place would mean diffing ~150 segments. Rebuilding
    is simpler and correct, and the cascade tests in T-03 already prove the
    children go with the parent.
    """
    db.execute(delete(TranscriptSegment).where(TranscriptSegment.meeting_id == meeting.id))
    db.execute(delete(ActionItem).where(ActionItem.meeting_id == meeting.id))
    db.execute(delete(Keyword).where(Keyword.meeting_id == meeting.id))
    db.execute(delete(Speaker).where(Speaker.meeting_id == meeting.id))
    db.execute(delete(Participant).where(Participant.meeting_id == meeting.id))
    if meeting.summary is not None:
        db.delete(meeting.summary)
    db.flush()


def _seed_meeting(
    db: Session, spec: dict[str, Any], users: dict[str, User], stats: SeedStats, anchor: datetime
) -> None:
    # ── Timeline first: everything else is derived from it ──────────────────
    lines = [(speaker, text) for speaker, text in spec["transcript"]]
    timeline = build_timeline(lines, seed=spec["seed_key"])
    assert_well_formed(timeline)

    started_at = (anchor + timedelta(days=spec["day_offset"])).replace(
        hour=int(spec["time"][:2]), minute=int(spec["time"][3:]), second=0, microsecond=0
    )

    host = users[spec["host"]]
    channel = None
    if spec.get("channel"):
        channel = db.execute(
            select(Channel).where(Channel.slug == spec["channel"])
        ).scalar_one_or_none()

    meeting = db.execute(
        select(Meeting).where(Meeting.seed_key == spec["seed_key"])
    ).scalar_one_or_none()
    if meeting is None:
        # NOT-NULL columns must be populated at construction — the flush below
        # is needed to get an id for the children, and it happens before the
        # assignments further down.
        meeting = Meeting(
            seed_key=spec["seed_key"],
            title=spec["title"],
            host_id=host.id,
            started_at=started_at,
            duration_seconds=0,
        )
        db.add(meeting)
        db.flush()
    else:
        _clear_meeting_children(db, meeting)

    meeting.title = spec["title"]
    meeting.description = spec.get("description")
    meeting.started_at = started_at
    meeting.host_id = host.id
    meeting.channel_id = channel.id if channel else None
    meeting.language = spec.get("language", "en")
    meeting.source = MeetingSource.SEED
    meeting.visibility = Visibility.TEAM
    meeting.deleted_at = None

    media = spec.get("media")
    meeting.media_type = MediaType.AUDIO if media else MediaType.NONE
    meeting.media_url = f"/api/v1/media/{media}" if media else None

    #: DERIVED, never authored — the last segment's end is the duration (T05-B).
    meeting.duration_seconds = timeline[-1].end_ms // 1000

    # ── Participants ────────────────────────────────────────────────────────
    talk_seconds = talk_time_by_speaker(timeline)
    participants: dict[str, Participant] = {}

    for entry in spec["participants"]:
        user = users[entry["slug"]]
        participant = Participant(
            meeting_id=meeting.id,
            user_id=user.id,
            display_name=user.name,
            email=user.email,
            role=ParticipantRole(entry.get("role", "attendee")),
            attended=entry.get("attended", True),
            talk_seconds=talk_seconds.get(user.name, 0),
        )
        db.add(participant)
        participants[user.name] = participant

    # Attendees without accounts — an all-hands is exactly where these appear,
    # and they are what pushes meeting 7 past the avatar-overflow threshold.
    for name in spec.get("extra_participants", []):
        participant = Participant(
            meeting_id=meeting.id,
            display_name=name,
            role=ParticipantRole.ATTENDEE,
            attended=True,
            talk_seconds=talk_seconds.get(name, 0),
        )
        db.add(participant)
        participants[name] = participant

    db.flush()

    # ── Speakers ────────────────────────────────────────────────────────────
    speakers: dict[str, Speaker] = {}
    for name in dict.fromkeys(segment.speaker for segment in timeline):
        speaker = Speaker(
            meeting_id=meeting.id,
            label=name,
            participant_id=participants[name].id if name in participants else None,
            # Authoritative colour, computed with the same hash the frontend
            # uses — see ADR-013.
            color_index=color_index(name),
        )
        db.add(speaker)
        speakers[name] = speaker
    db.flush()

    # ── Transcript ──────────────────────────────────────────────────────────
    for segment in timeline:
        db.add(
            TranscriptSegment(
                meeting_id=meeting.id,
                speaker_id=speakers[segment.speaker].id,
                start_ms=segment.start_ms,
                end_ms=segment.end_ms,
                sequence=segment.sequence,
                text=segment.text,
            )
        )
    stats.segments += len(timeline)

    # ── Summary ─────────────────────────────────────────────────────────────
    summary_spec = spec["summary"]
    summary = Summary(
        meeting_id=meeting.id,
        overview=summary_spec["overview"],
        gist=summary_spec.get("gist"),
        provider="mock",
        model="extractive-v1",
    )
    db.add(summary)
    db.flush()

    for index, entry in enumerate(summary_spec["outline"]):
        # Outline timestamps point at a REAL segment (T05-D). Storing a segment
        # index in the fixture and resolving it here is what guarantees that —
        # a hand-written millisecond would drift the moment a line is edited.
        segment = timeline[entry["at_segment"]]
        db.add(
            SummarySection(
                summary_id=summary.id,
                kind=SummarySectionKind.OUTLINE,
                title=entry["title"],
                start_ms=segment.start_ms,
                sequence=index,
            )
        )

    sequence = len(summary_spec["outline"])
    for group in summary_spec.get("notes", []):
        for bullet in group["bullets"]:
            db.add(
                SummarySection(
                    summary_id=summary.id,
                    kind=SummarySectionKind.NOTES,
                    title=group["chapter"],
                    body=bullet,
                    sequence=sequence,
                )
            )
            sequence += 1

    # ── Keywords ────────────────────────────────────────────────────────────
    for index, term in enumerate(summary_spec["keywords"]):
        db.add(
            Keyword(
                meeting_id=meeting.id,
                term=term,
                weight=round(1.0 - index * 0.08, 4),
            )
        )
        stats.keywords += 1

    # ── Action items ────────────────────────────────────────────────────────
    for index, item in enumerate(spec.get("action_items", [])):
        assignee = participants.get(item["assignee"]) if item.get("assignee") else None
        status = ActionItemStatus(item.get("status", "open"))

        due: date | None = None
        if "due_in_days" in item:
            due = (anchor + timedelta(days=item["due_in_days"])).date()

        start_ms = None
        if "at_segment" in item:
            start_ms = timeline[item["at_segment"]].start_ms

        db.add(
            ActionItem(
                meeting_id=meeting.id,
                text=item["text"],
                assignee_participant_id=assignee.id if assignee else None,
                due_date=due,
                status=status,
                completed_at=started_at if status is ActionItemStatus.COMPLETED else None,
                source=ActionItemSource.AI,
                start_ms=start_ms,
                sequence=index,
            )
        )
        stats.action_items += 1

    # ── Tags ────────────────────────────────────────────────────────────────
    meeting.tags = list(db.execute(select(Tag).where(Tag.name.in_(spec.get("tags", [])))).scalars())

    stats.meetings += 1


# ── Entry points ────────────────────────────────────────────────────────────


def _wipe(db: Session) -> None:
    """Delete seeded meetings and reference data.

    Meetings cascade to everything they own, so this is one statement per
    top-level table rather than a careful ordering.
    """
    for meeting in db.execute(select(Meeting)).scalars().all():
        db.delete(meeting)

    # The flush is load-bearing. ORM deletes are queued until flush, while the
    # bulk deletes below execute immediately — so without it, users are deleted
    # while meetings still reference them and `host_id RESTRICT` fires. Only
    # visible at all because foreign keys are genuinely enforced (see ADR/T-03,
    # where the pragma turned out not to be applied).
    db.flush()

    db.execute(delete(Tag))
    db.execute(delete(Channel))
    db.execute(delete(User))
    db.commit()


def seed_into(db: Session, *, reset: bool = False, quiet: bool = False) -> SeedStats:
    """Seed using a caller-supplied session.

    Split out from `seed()` so tests can run the real seeder against their own
    throwaway database. A seeder that can only write to the configured database
    has to be tested by proxy, which mostly tests the proxy.
    """
    stats = SeedStats()
    anchor = _anchor()

    if reset:
        _wipe(db)

    users = _seed_cast(db, stats)

    for path in sorted(MEETINGS_DIR.glob("*.json")):
        _seed_meeting(db, _load(path), users, stats, anchor)

    db.commit()

    # T-05.12 — the FTS index is trigger-maintained, so it should already be
    # correct. Verified rather than rebuilt: a known phrase must come back,
    # which catches a missing migration far more usefully than a row count.
    from app.db.search import search_segments

    hits = search_segments(db, "pricing")
    if not hits:
        raise RuntimeError(
            "FTS index returned nothing for a phrase known to be seeded — "
            "is the transcript_fts migration applied?"
        )

    if not quiet:
        print(f"seed: {stats.render()}")
        print(f"seed: anchored at {anchor.date().isoformat()}")
        print(f"seed: FTS verified — {len(hits)} hits for 'pricing'")

    return stats


def seed(*, reset: bool = False, quiet: bool = False) -> SeedStats:
    with SessionLocal() as db:
        return seed_into(db, reset=reset, quiet=quiet)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed the Fireflies demo database.")
    parser.add_argument(
        "--reset", action="store_true", help="Drop all data and rebuild from scratch."
    )
    parser.add_argument("--quiet", action="store_true", help="Suppress the summary output.")
    args = parser.parse_args(argv)

    seed(reset=args.reset, quiet=args.quiet)
    return 0


def summary_table() -> str:
    """Row counts, for `make seed-demo` (T-05.13)."""
    with SessionLocal() as db:
        counts = {
            "meetings": db.execute(select(func.count()).select_from(Meeting)).scalar_one(),
            "segments": db.execute(
                select(func.count()).select_from(TranscriptSegment)
            ).scalar_one(),
            "action items": db.execute(select(func.count()).select_from(ActionItem)).scalar_one(),
            "keywords": db.execute(select(func.count()).select_from(Keyword)).scalar_one(),
            "participants": db.execute(select(func.count()).select_from(Participant)).scalar_one(),
            "users": db.execute(select(func.count()).select_from(User)).scalar_one(),
        }
    width = max(len(label) for label in counts)
    lines = [f"  {label.rjust(width)}  {value:>6,}" for label, value in counts.items()]
    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())
