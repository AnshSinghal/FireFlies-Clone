"""Seed validation (T-05.14).

Run in CI. Checks the invariants that make the demo credible and that the rest
of the app quietly assumes — every meeting has speakers, a summary, keywords and
a well-formed timeline; every outline timestamp points at a real segment; no
orphans.

Deliberately separate from the seeder. A validator that shares code with the
thing it validates will agree with it about the wrong answer.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from itertools import pairwise
from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import (
    ActionItem,
    Keyword,
    Meeting,
    Participant,
    Speaker,
    Summary,
    SummarySection,
    TranscriptSegment,
)
from app.models.enums import ActionItemStatus, SummarySectionKind

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

MIN_SEGMENTS = 20
MIN_MEETINGS = 8


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    checks: int = 0

    def check(self, condition: bool, message: str) -> None:
        self.checks += 1
        if not condition:
            self.errors.append(message)

    @property
    def ok(self) -> bool:
        return not self.errors


def validate(db: Session) -> Report:
    report = Report()
    meetings = list(db.execute(select(Meeting)).scalars())

    report.check(
        len(meetings) >= MIN_MEETINGS,
        f"expected at least {MIN_MEETINGS} meetings, found {len(meetings)}",
    )

    for meeting in meetings:
        label = f"[{meeting.seed_key or meeting.id}]"

        segments = list(
            db.execute(
                select(TranscriptSegment)
                .where(TranscriptSegment.meeting_id == meeting.id)
                .order_by(TranscriptSegment.sequence)
            ).scalars()
        )
        speakers = db.execute(
            select(func.count()).select_from(Speaker).where(Speaker.meeting_id == meeting.id)
        ).scalar_one()
        keywords = db.execute(
            select(func.count()).select_from(Keyword).where(Keyword.meeting_id == meeting.id)
        ).scalar_one()
        summary = db.execute(
            select(Summary).where(Summary.meeting_id == meeting.id)
        ).scalar_one_or_none()

        report.check(speakers >= 1, f"{label} has no speakers")
        report.check(
            len(segments) >= MIN_SEGMENTS,
            f"{label} has {len(segments)} segments, expected >= {MIN_SEGMENTS}",
        )
        report.check(summary is not None, f"{label} has no summary")
        report.check(keywords >= 1, f"{label} has no keywords")
        report.check(bool(meeting.title.strip()), f"{label} has a blank title")

        if not segments:
            continue

        # Timeline integrity — the invariant the player's binary search relies on.
        for previous, current in pairwise(segments):
            if current.start_ms < previous.end_ms:
                report.errors.append(f"{label} segments overlap at sequence {current.sequence}")
                break
            if current.sequence != previous.sequence + 1:
                report.errors.append(f"{label} sequence gap before {current.sequence}")
                break
        report.checks += 1

        # duration_seconds is denormalised; if it drifts from the transcript,
        # every row in the Notebook lies.
        expected = segments[-1].end_ms // 1000
        report.check(
            abs(meeting.duration_seconds - expected) <= 1,
            f"{label} duration {meeting.duration_seconds}s != derived {expected}s",
        )

        # Every speaker must actually speak, or the participants list shows a
        # person with an empty transcript.
        speaking = {s.speaker_id for s in segments}
        orphan_speakers = db.execute(
            select(func.count())
            .select_from(Speaker)
            .where(Speaker.meeting_id == meeting.id, Speaker.id.notin_(speaking))
        ).scalar_one()
        report.check(orphan_speakers == 0, f"{label} has {orphan_speakers} silent speakers")

        if summary is None:
            continue

        # Outline timestamps must land inside a real segment (T05-D). A
        # timestamp in a gap seeks the player somewhere the transcript cannot
        # highlight, which looks like a broken feature.
        outline = list(
            db.execute(
                select(SummarySection).where(
                    SummarySection.summary_id == summary.id,
                    SummarySection.kind == SummarySectionKind.OUTLINE,
                )
            ).scalars()
        )
        report.check(
            len(outline) >= 4,
            f"{label} has {len(outline)} outline entries, expected >= 4",
        )

        for entry in outline:
            if entry.start_ms is None:
                report.errors.append(f"{label} outline '{entry.title}' has no timestamp")
                continue
            inside = any(s.start_ms <= entry.start_ms <= s.end_ms for s in segments)
            report.check(
                inside, f"{label} outline '{entry.title}' at {entry.start_ms}ms is in a gap"
            )

    # ── Cross-cutting: every badge state needs a seeded example ─────────────
    open_items = db.execute(
        select(func.count())
        .select_from(ActionItem)
        .where(ActionItem.status == ActionItemStatus.OPEN)
    ).scalar_one()
    completed = db.execute(
        select(func.count())
        .select_from(ActionItem)
        .where(ActionItem.status == ActionItemStatus.COMPLETED)
    ).scalar_one()
    unassigned = db.execute(
        select(func.count())
        .select_from(ActionItem)
        .where(ActionItem.assignee_participant_id.is_(None))
    ).scalar_one()
    undated = db.execute(
        select(func.count()).select_from(ActionItem).where(ActionItem.due_date.is_(None))
    ).scalar_one()

    report.check(open_items >= 1, "no open action items")
    report.check(completed >= 1, "no completed action items")
    report.check(
        unassigned >= 1,
        "no unassigned action items - the Unassigned group would be empty",
    )
    report.check(undated >= 1, "no action items without a due date")

    # Orphans. Foreign keys prevent most of these, but a participant belonging
    # to no meeting would still be possible via a bad delete.
    orphan_participants = db.execute(
        select(func.count())
        .select_from(Participant)
        .where(Participant.meeting_id.notin_(select(Meeting.id)))
    ).scalar_one()
    report.check(orphan_participants == 0, f"{orphan_participants} orphaned participants")

    return report


def main() -> int:
    with SessionLocal() as db:
        report = validate(db)

    if report.ok:
        print(f"seed validation: {report.checks} checks passed")
        return 0

    print(f"seed validation FAILED — {len(report.errors)} problem(s):\n")
    for error in report.errors:
        print(f"  {error}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
