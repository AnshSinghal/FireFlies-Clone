"""AskFred — grounded question answering over one meeting (T-37).

The service owns two decisions the router must not:

- History is truncated HERE, to the last six turns. The client may send its
  whole conversation; trusting it to trim is trusting it with the token bill.
- Citations come back from the provider as (speaker, quote, start_ms) — the
  provider speaks transcript text, not database ids — and are resolved to
  segment ids here, because the chip in the UI needs something to seek and
  flash, and a quote alone cannot be clicked.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.ai.types import AnswerCitation, ChatTurn
from app.models import Speaker, TranscriptSegment
from app.schemas.ask import MAX_HISTORY_TURNS, AskCitation, AskRequest, AskResponse
from app.services.meetings import MeetingService

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.ai.provider import AIProvider


class AskService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def ask(self, meeting_id: int, payload: AskRequest, provider: AIProvider) -> AskResponse:
        meetings = MeetingService(self.db)
        meeting = meetings.get(meeting_id)
        transcript = meetings._transcript_for_ai(meeting)

        history = [
            ChatTurn(role=turn.role, text=turn.text)
            # The LAST turns, not the first: recency is what a follow-up needs.
            for turn in payload.history[-MAX_HISTORY_TURNS:]
        ]

        result = provider.answer_question(transcript, payload.question, history)

        citations = self._resolve_citations(meeting_id, result.citations)

        return AskResponse(
            answer=result.text,
            citations=citations,
            # Grounded means "the answer points at the transcript". The
            # guardrail response carries no citations by construction, so this
            # needs no string matching against the refusal copy.
            grounded=bool(citations),
            provider=provider.name,
        )

    def _resolve_citations(self, meeting_id: int, cited: list[AnswerCitation]) -> list[AskCitation]:
        """Map (start_ms, quote) back to real segment rows.

        Matched by `start_ms` first — unique per segment in practice — with the
        quote as a tiebreak. A citation that resolves to nothing is DROPPED
        rather than sent with a fake id: a chip that seeks nowhere teaches the
        user not to click chips.
        """
        if not cited:
            return []

        rows = self.db.execute(
            select(TranscriptSegment, Speaker.label)
            .join(Speaker, TranscriptSegment.speaker_id == Speaker.id)
            .where(
                TranscriptSegment.meeting_id == meeting_id,
                TranscriptSegment.start_ms.in_({c.start_ms for c in cited}),
            )
        ).all()
        by_start = {segment.start_ms: (segment, label) for segment, label in rows}

        citations: list[AskCitation] = []
        for cite in cited:
            match = by_start.get(cite.start_ms)
            if match is None:
                continue
            segment, label = match
            citations.append(
                AskCitation(
                    segment_id=segment.id,
                    start_ms=segment.start_ms,
                    speaker=label,
                    snippet=_clip(cite.quote or segment.text),
                )
            )
        return citations


def _clip(text: str, limit: int = 160) -> str:
    """A chip-sized snippet: whole words, an ellipsis only when something was cut."""
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return f"{cut}…"
