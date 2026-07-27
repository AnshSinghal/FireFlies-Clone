"""Action item CRUD and ordering (T-24)."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.action_item import ActionItem
from app.models.enums import ActionItemSource, ActionItemStatus
from app.schemas.meeting import ActionItemCreate, ActionItemUpdate
from app.services.meetings import MeetingService
from tests.factories import make_meeting, make_participant, make_user


def _item(db: Session, meeting_id: int, **kwargs: object) -> ActionItem:
    defaults: dict[str, object] = {
        "meeting_id": meeting_id,
        "text": "Do the thing",
        "status": ActionItemStatus.OPEN,
        "source": ActionItemSource.AI,
        "sequence": 0,
    }
    item = ActionItem(**{**defaults, **kwargs})  # type: ignore[arg-type]
    db.add(item)
    db.flush()
    return item


class TestOrdering:
    """T-24.1: open before completed, then due date with nulls last, then time."""

    def test_open_items_come_before_completed(self, db: Session) -> None:
        meeting = make_meeting(db)
        _item(db, meeting.id, text="done", status=ActionItemStatus.COMPLETED, sequence=0)
        _item(db, meeting.id, text="open", sequence=1)

        items = MeetingService(db).action_items(meeting.id)

        assert [item.text for item in items] == ["open", "done"]

    def test_due_dates_sort_ascending_with_no_date_last(self, db: Session) -> None:
        """SQLite sorts NULL first and Postgres sorts it last, so it is explicit.

        An item with no due date belongs at the bottom either way — it is the
        least urgent thing in the list, not the most.
        """
        meeting = make_meeting(db)
        today = date(2026, 7, 26)
        _item(db, meeting.id, text="none", due_date=None, sequence=0)
        _item(db, meeting.id, text="later", due_date=today + timedelta(days=7), sequence=1)
        _item(db, meeting.id, text="sooner", due_date=today, sequence=2)

        items = MeetingService(db).action_items(meeting.id)

        assert [item.text for item in items] == ["sooner", "later", "none"]

    def test_items_without_a_due_date_fall_back_to_the_moment_they_were_raised(
        self, db: Session
    ) -> None:
        meeting = make_meeting(db)
        _item(db, meeting.id, text="late", start_ms=900_000, sequence=0)
        _item(db, meeting.id, text="early", start_ms=60_000, sequence=1)

        items = MeetingService(db).action_items(meeting.id)

        assert [item.text for item in items] == ["early", "late"]


class TestCreate:
    def test_a_manual_item_is_appended_and_marked_manual(self, db: Session) -> None:
        meeting = make_meeting(db)
        _item(db, meeting.id, text="extracted", sequence=5)

        out = MeetingService(db).create_action_item(
            meeting.id, ActionItemCreate(text="  typed by hand  ")
        )

        assert out.text == "typed by hand"  # trimmed
        assert out.source is ActionItemSource.MANUAL
        assert out.status is ActionItemStatus.OPEN
        assert out.meeting_id == meeting.id

    def test_an_empty_text_is_rejected_before_it_reaches_the_database(self) -> None:
        with pytest.raises(ValueError):
            ActionItemCreate(text="   ")

    def test_an_assignee_from_another_meeting_is_refused(
        self, client: TestClient, db: Session
    ) -> None:
        """The invariant no foreign key can express (see AssigneeNotInMeetingError)."""
        meeting = make_meeting(db)
        # A host of its own: `make_meeting` creates one, and users are unique
        # on an email the factory derives from the name.
        other = make_meeting(db, host=make_user(db, name="Other Host"))
        # A distinct name, because the factory derives the linked user's email
        # from it and users are unique on email.
        outsider = make_participant(db, other, display_name="Outside Person")
        db.commit()

        response = client.post(
            f"/api/v1/meetings/{meeting.id}/action-items",
            json={"text": "Ask them", "assignee_participant_id": outsider.id},
        )

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "ASSIGNEE_NOT_IN_MEETING"


class TestUpdate:
    def test_completing_an_item_stamps_completed_at(self, db: Session) -> None:
        meeting = make_meeting(db)
        item = _item(db, meeting.id)
        db.commit()

        MeetingService(db).update_action_item(
            item.id, ActionItemUpdate(status=ActionItemStatus.COMPLETED)
        )
        db.refresh(item)
        assert item.completed_at is not None

        MeetingService(db).update_action_item(
            item.id, ActionItemUpdate(status=ActionItemStatus.OPEN)
        )
        db.refresh(item)
        # Cleared on reopen, so a reopened item cannot claim a completion time.
        assert item.completed_at is None

    def test_an_absent_field_is_left_alone(self, db: Session) -> None:
        meeting = make_meeting(db)
        item = _item(db, meeting.id, text="original", due_date=date(2026, 8, 1))
        db.commit()

        MeetingService(db).update_action_item(
            item.id, ActionItemUpdate(status=ActionItemStatus.COMPLETED)
        )
        db.refresh(item)

        assert item.text == "original"
        assert item.due_date == date(2026, 8, 1)

    def test_an_explicit_null_clears_the_field(self, client: TestClient, db: Session) -> None:
        """Absent and null are DIFFERENT requests.

        Treating null as "not sent" — the `is not None` shortcut — would make
        unassigning an item impossible through the API.
        """
        meeting = make_meeting(db)
        person = make_participant(db, meeting)
        item = _item(
            db,
            meeting.id,
            assignee_participant_id=person.id,
            due_date=date(2026, 8, 1),
        )
        db.commit()

        response = client.patch(
            f"/api/v1/meetings/action-items/{item.id}",
            json={"assignee_participant_id": None, "due_date": None},
        )

        assert response.status_code == 200
        assert response.json()["assignee_participant_id"] is None
        assert response.json()["due_date"] is None

    def test_editing_an_unknown_item_is_404(self, client: TestClient) -> None:
        response = client.patch("/api/v1/meetings/action-items/999999", json={"text": "hi"})
        assert response.status_code == 404


class TestDelete:
    def test_delete_returns_the_item_so_undo_can_restore_it(
        self, client: TestClient, db: Session
    ) -> None:
        meeting = make_meeting(db)
        item = _item(db, meeting.id, text="Send the deck")
        db.commit()

        response = client.delete(f"/api/v1/meetings/action-items/{item.id}")

        assert response.status_code == 200
        assert response.json()["text"] == "Send the deck"
        # Gone for real — a hard delete, unlike meetings.
        assert client.delete(f"/api/v1/meetings/action-items/{item.id}").status_code == 404
