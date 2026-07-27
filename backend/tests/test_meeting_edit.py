"""Editing a meeting's metadata (T-27)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.action_item import ActionItem
from app.models.enums import ActionItemSource, ActionItemStatus
from tests.factories import make_meeting, make_participant, make_user


class TestPartialUpdate:
    def test_an_unmentioned_field_is_left_alone(self, client: TestClient, db: Session) -> None:
        """The half of PATCH that is easy to get wrong (T-27.6)."""
        meeting = make_meeting(db, title="Original", description="Original description")
        db.commit()

        response = client.patch(f"/api/v1/meetings/{meeting.id}", json={"title": "Renamed"})

        assert response.status_code == 200
        assert response.json()["title"] == "Renamed"
        assert response.json()["description"] == "Original description"

    def test_an_explicit_null_clears_a_field(self, client: TestClient, db: Session) -> None:
        meeting = make_meeting(db, description="Original description")
        db.commit()

        response = client.patch(f"/api/v1/meetings/{meeting.id}", json={"description": None})

        assert response.json()["description"] is None

    def test_a_blank_title_is_refused(self, client: TestClient, db: Session) -> None:
        meeting = make_meeting(db)
        db.commit()

        assert (
            client.patch(f"/api/v1/meetings/{meeting.id}", json={"title": "   "}).status_code == 422
        )

    def test_an_over_long_title_is_refused(self, client: TestClient, db: Session) -> None:
        meeting = make_meeting(db)
        db.commit()

        response = client.patch(f"/api/v1/meetings/{meeting.id}", json={"title": "x" * 250})
        assert response.status_code == 422


class TestParticipants:
    def test_the_list_is_reconciled_not_replaced(self, client: TestClient, db: Session) -> None:
        """A participant who survives the edit KEEPS THEIR ID.

        Their action items, speaker link and talk time all hang off it —
        deleting the lot and re-adding would orphan every one.
        """
        meeting = make_meeting(db)
        kept = make_participant(db, meeting, display_name="Ada Lovelace")
        make_participant(db, meeting, display_name="Alan Turing")
        db.add(
            ActionItem(
                meeting_id=meeting.id,
                assignee_participant_id=kept.id,
                text="Send the deck",
                status=ActionItemStatus.OPEN,
                source=ActionItemSource.AI,
                sequence=0,
            )
        )
        db.commit()
        kept_id = kept.id

        response = client.patch(
            f"/api/v1/meetings/{meeting.id}",
            json={"participant_names": ["Ada Lovelace", "Grace Hopper"]},
        )

        assert response.status_code == 200
        names = {person["display_name"] for person in response.json()["participants"]}
        assert names == {"Ada Lovelace", "Grace Hopper"}

        # Same row, so the action item still points at somebody.
        ada = next(
            p for p in response.json()["participants"] if p["display_name"] == "Ada Lovelace"
        )
        assert ada["id"] == kept_id

        items = client.get(f"/api/v1/meetings/{meeting.id}/action-items").json()
        assert items[0]["assignee_participant_id"] == kept_id

    def test_duplicate_names_are_blocked(self, client: TestClient, db: Session) -> None:
        """Blocked, not de-duplicated.

        Silently dropping one leaves the user looking at a list that does not
        match what they typed.
        """
        meeting = make_meeting(db)
        db.commit()

        response = client.patch(
            f"/api/v1/meetings/{meeting.id}",
            json={"participant_names": ["Ada Lovelace", "ada lovelace"]},
        )

        assert response.status_code == 422

    def test_matching_ignores_case_and_padding(self, client: TestClient, db: Session) -> None:
        meeting = make_meeting(db)
        existing = make_participant(db, meeting, display_name="Ada Lovelace")
        db.commit()
        existing_id = existing.id

        response = client.patch(
            f"/api/v1/meetings/{meeting.id}",
            json={"participant_names": ["  ada lovelace  "]},
        )

        people = response.json()["participants"]
        assert len(people) == 1
        assert people[0]["id"] == existing_id


class TestHost:
    def test_the_host_can_be_moved_to_another_participant(
        self, client: TestClient, db: Session
    ) -> None:
        meeting = make_meeting(db)
        other_user = make_user(db, name="Grace Hopper")
        participant = make_participant(
            db, meeting, display_name="Grace Hopper", user_id=other_user.id
        )
        db.commit()

        response = client.patch(
            f"/api/v1/meetings/{meeting.id}", json={"host_participant_id": participant.id}
        )

        assert response.status_code == 200
        assert response.json()["host"]["name"] == "Grace Hopper"

    def test_a_participant_without_an_account_cannot_host(
        self, client: TestClient, db: Session
    ) -> None:
        """The honest answer, rather than inventing an account for them."""
        meeting = make_meeting(db)
        external = make_participant(db, meeting, display_name="External Guest")
        db.commit()

        response = client.patch(
            f"/api/v1/meetings/{meeting.id}", json={"host_participant_id": external.id}
        )

        assert response.status_code == 422
        assert "no account" in response.json()["error"]["message"]

    def test_a_participant_from_another_meeting_is_refused(
        self, client: TestClient, db: Session
    ) -> None:
        meeting = make_meeting(db)
        other = make_meeting(db, host=make_user(db, name="Other Host"))
        outsider = make_participant(db, other, display_name="Outsider")
        db.commit()

        response = client.patch(
            f"/api/v1/meetings/{meeting.id}", json={"host_participant_id": outsider.id}
        )

        assert response.status_code == 422
