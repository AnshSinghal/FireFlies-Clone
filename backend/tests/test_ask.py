"""AskFred (T-37, cases T37-A → T37-D)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import TranscriptSegment
from tests.factories import make_meeting, make_speaker


@pytest.fixture()
def meeting_with_lines(db: Session):
    meeting = make_meeting(db, title="Pricing sync")
    sarah = make_speaker(db, meeting, label="Sarah Chen", color_index=0)
    marcus = make_speaker(db, meeting, label="Marcus Patel", color_index=1)

    lines = [
        (sarah, "The pricing model moves to usage-based billing next quarter."),
        (marcus, "I'll write up the grandfathering plan for existing contracts."),
        (sarah, "Mobile onboarding is two weeks behind because of incident work."),
    ]
    for index, (speaker, text) in enumerate(lines):
        db.add(
            TranscriptSegment(
                meeting_id=meeting.id,
                speaker_id=speaker.id,
                sequence=index,
                start_ms=index * 30_000,
                end_ms=index * 30_000 + 20_000,
                text=text,
            )
        )
    db.commit()
    return meeting


class TestAsk:
    def test_t37a_a_present_topic_gets_a_cited_answer(
        self, client: TestClient, meeting_with_lines, db: Session
    ) -> None:
        response = client.post(
            f"/api/v1/meetings/{meeting_with_lines.id}/ask",
            json={"question": "What is happening with pricing?"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["answer"].strip()
        assert body["grounded"] is True
        assert body["citations"], "an answer with no citations is not demonstrably grounded"

        # Every citation points at a segment that really exists in THIS meeting.
        valid_ids = {
            row[0]
            for row in db.execute(
                TranscriptSegment.__table__.select().with_only_columns(TranscriptSegment.id)
            )
        }
        for citation in body["citations"]:
            assert citation["segment_id"] in valid_ids
            assert citation["snippet"].strip()
            assert citation["speaker"]

    def test_t37b_an_absent_topic_refuses_rather_than_hallucinating(
        self, client: TestClient, meeting_with_lines
    ) -> None:
        response = client.post(
            f"/api/v1/meetings/{meeting_with_lines.id}/ask",
            json={"question": "What did we decide about quantum blockchain synergy?"},
        )

        body = response.json()
        assert body["grounded"] is False
        assert body["citations"] == []
        # The explicit guardrail copy, not an invented answer.
        assert "doesn't cover" in body["answer"] or "couldn't find" in body["answer"].lower()

    def test_t37c_the_eleventh_question_in_a_minute_is_limited(
        self, client: TestClient, meeting_with_lines
    ) -> None:
        url = f"/api/v1/meetings/{meeting_with_lines.id}/ask"
        payload = {"question": "What is happening with pricing?"}

        statuses = [client.post(url, json=payload).status_code for _ in range(11)]

        assert statuses[:10] == [200] * 10
        assert statuses[10] == 429
        # The shared error envelope, so the client renders it like any failure.
        eleventh = client.post(url, json=payload)
        assert eleventh.json()["error"]["code"] == "RATE_LIMITED"

    def test_t37d_history_is_truncated_to_six_turns_server_side(
        self, client: TestClient, meeting_with_lines, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The client may send twenty turns; the provider sees six."""
        from app.ai.mock import MockProvider

        seen: dict[str, int] = {}
        original = MockProvider.answer_question

        def spy(self, transcript, question, history=()):
            seen["turns"] = len(history)
            return original(self, transcript, question, history)

        monkeypatch.setattr(MockProvider, "answer_question", spy)

        history = [
            {"role": "user" if i % 2 == 0 else "assistant", "text": f"turn {i}"} for i in range(20)
        ]
        client.post(
            f"/api/v1/meetings/{meeting_with_lines.id}/ask",
            json={"question": "and who owns that?", "history": history},
        )

        assert seen["turns"] == 6

    def test_a_deleted_meeting_answers_410_not_an_answer(
        self, client: TestClient, meeting_with_lines
    ) -> None:
        client.delete(f"/api/v1/meetings/{meeting_with_lines.id}")
        response = client.post(
            f"/api/v1/meetings/{meeting_with_lines.id}/ask", json={"question": "anything"}
        )
        assert response.status_code == 410
