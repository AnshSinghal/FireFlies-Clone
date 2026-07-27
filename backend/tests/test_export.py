"""Export endpoints (T-34, cases T34-A → T34-F plus the bulk zip).

Everything asserts against FACTORY data, never seed data: the spec's example
filename `q3-...-2026-07-24.pdf` is exactly what `make_meeting`'s defaults
produce, while seed dates float with SEED_ANCHOR_DATE and would rot the
assertions.
"""

from __future__ import annotations

import io
import re
import time
import tracemalloc
import zipfile
from datetime import UTC, date, datetime

import docx
import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ActionItem, SummarySection
from app.models.enums import ActionItemStatus, SummarySectionKind
from app.services.export.filename import export_filename, slugify
from app.services.export.registry import register_section
from tests.factories import (
    make_action_items,
    make_full_meeting,
    make_meeting,
    make_segments,
    make_speaker,
    make_summary,
    make_user,
)

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _export_url(meeting_id: int) -> str:
    return f"/api/v1/meetings/{meeting_id}/export"


def _pdf_pages(payload: bytes) -> int:
    """Count page objects straight off the PDF body.

    `/Type /Page` appears once per page in the (uncompressed) object
    dictionaries ReportLab writes; the trailing `\\W` keeps the page-tree's
    `/Type /Pages` from matching. Cheaper than adding a PDF parser as a test
    dependency for one number.
    """
    return len(re.findall(rb"/Type\s*/Page\W", payload))


def _complete_first_action_item(db: Session, meeting_id: int) -> None:
    """Flip one item so both checkbox states appear in the output."""
    item = (
        db.execute(
            select(ActionItem)
            .where(ActionItem.meeting_id == meeting_id)
            .order_by(ActionItem.sequence)
        )
        .scalars()
        .first()
    )
    assert item is not None
    item.status = ActionItemStatus.COMPLETED
    db.commit()


def _add_note_sections(db: Session, meeting_id: int, summary_id: int) -> None:
    """`make_summary` only creates OUTLINE rows; notes are added by hand."""
    assert meeting_id  # documents which meeting the summary belongs to
    db.add(
        SummarySection(
            summary_id=summary_id,
            kind=SummarySectionKind.NOTES,
            title="Pricing",
            body="Revisit the tiers before the quarter closes\nLegal review needed for the new SKU",
            sequence=10,
        )
    )
    db.commit()


# ── T34-A · Markdown ────────────────────────────────────────────────────────


def test_t34_a_markdown_has_all_selected_headings_and_checkboxes(
    client: TestClient, db: Session
) -> None:
    meeting = make_full_meeting(db)
    _complete_first_action_item(db, meeting.id)
    assert meeting.summary is not None
    _add_note_sections(db, meeting.id, meeting.summary.id)

    response = client.get(_export_url(meeting.id), params={"format": "md"})

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"].startswith("text/markdown")
    body = response.text

    # `# Title`, then the five canonical sections in order, then the transcript.
    assert body.startswith("# Q3 Product Roadmap Sync\n")
    positions = [
        body.index("## Keywords"),
        body.index("## Meeting Overview"),
        body.index("## Meeting Outline"),
        body.index("## Bullet-Point Notes"),
        body.index("## Action Items"),
        body.index("## Transcript"),
    ]
    assert positions == sorted(positions), "canonical sections out of order"

    # The metadata block.
    assert "- **Date:** 24 July 2026" in body
    assert "- **Host:** Sarah Chen" in body

    # Outline timestamps as [MM:SS]; chapters from the factory sit a minute apart.
    assert "- [00:00] Chapter 1" in body
    assert "- [01:00] Chapter 2" in body

    # Action items as GitHub-style checkboxes, both states present.
    assert "- [x] Follow up on item 1" in body
    assert "- [ ] Follow up on item 2" in body

    # Notes grouped under their chapter.
    assert "### Pricing" in body
    assert "- Revisit the tiers before the quarter closes" in body

    # Transcript turns: `**Speaker** [00:14] text`.
    assert re.search(r"\*\*Speaker 1\*\* \[00:00\] We should revisit", body)

    # Pastes into GitHub/Notion — pure Markdown, no raw HTML anywhere.
    assert "<" not in body


def test_t34_a_markdown_filename_matches_the_spec_example(client: TestClient, db: Session) -> None:
    """`make_meeting`'s defaults reproduce PLAN.md's example name exactly."""
    meeting = make_full_meeting(db)

    response = client.get(_export_url(meeting.id), params={"format": "md"})

    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="q3-product-roadmap-sync-2026-07-24.md"'
    )


# ── T34-B · Plain text ──────────────────────────────────────────────────────

#: Long enough that `[MM:SS] Speaker: ` + text must wrap at 100 columns.
LONG_LINE = (
    "We agreed the onboarding flow needs a shorter first-run checklist, so the mobile "
    "team will trim the tour to three screens and measure completion before the next "
    "design review."
)


def test_t34_b_plain_text_is_wrapped_and_markup_free(client: TestClient, db: Session) -> None:
    user = make_user(db)
    meeting = make_meeting(db, host=user)
    speakers = [
        make_speaker(db, meeting, label=f"Speaker {i + 1}", color_index=i) for i in range(2)
    ]
    make_segments(db, meeting, speakers, count=8, text=LONG_LINE)
    summary = make_summary(db, meeting)
    make_action_items(db, meeting)
    db.commit()
    _add_note_sections(db, meeting.id, summary.id)

    response = client.get(_export_url(meeting.id), params={"format": "txt"})

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"].startswith("text/plain")
    body = response.text

    # `====`-underlined headings, no Markdown or HTML markup.
    assert body.startswith("Q3 Product Roadmap Sync\n=======================\n")
    assert "\nTranscript\n==========\n" in body
    assert "##" not in body
    assert "**" not in body
    assert "<" not in body

    # Every block type renders as plain fixed-width text.
    assert re.search(r"^\[00:00\] Chapter 1$", body, re.MULTILINE)
    assert re.search(r"^- Revisit the tiers before the quarter closes$", body, re.MULTILINE)
    assert re.search(r"^\[ \] Follow up on item 1", body, re.MULTILINE)

    # `[MM:SS] Speaker: text` lines, hard-wrapped at 100 columns.
    assert re.search(r"^\[00:00\] Speaker 1: We agreed", body, re.MULTILINE)
    longest = max(len(line) for line in body.splitlines())
    assert longest <= 100, f"a line ran to {longest} columns"


# ── T34-C · PDF ─────────────────────────────────────────────────────────────


def test_t34_c_pdf_magic_bytes_and_multiple_pages(client: TestClient, db: Session) -> None:
    """The seed's longest meeting is 159 segments; 200 factory segments stand
    in for it so the assertion cannot drift with the seed files.

    The title is deliberately longer than the header band can hold, so the
    ellipsis truncation path renders too.
    """
    user = make_user(db)
    meeting = make_meeting(
        db,
        host=user,
        title=(
            "Design Review — Mobile Onboarding, Activation Experiments and "
            "the Q3 Growth Retrospective Readout for the Whole Product Group"
        ),
    )
    speakers = [
        make_speaker(db, meeting, label=f"Speaker {i + 1}", color_index=i) for i in range(3)
    ]
    make_segments(db, meeting, speakers, count=200)
    summary = make_summary(db, meeting)
    make_action_items(db, meeting)
    db.commit()
    _add_note_sections(db, meeting.id, summary.id)
    _complete_first_action_item(db, meeting.id)

    response = client.get(_export_url(meeting.id), params={"format": "pdf"})

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"].endswith('.pdf"')
    assert response.content.startswith(b"%PDF-")
    assert _pdf_pages(response.content) > 1


# ── T34-D · include= selection ──────────────────────────────────────────────


def test_t34_d_include_summary_only_omits_transcript_and_actions(
    client: TestClient, db: Session
) -> None:
    meeting = make_full_meeting(db)

    response = client.get(_export_url(meeting.id), params={"format": "md", "include": "summary"})

    body = response.text
    assert "## Meeting Overview" in body
    assert "## Transcript" not in body
    assert "## Action Items" not in body
    assert "Speaker 1" not in body


def test_t34_d_include_order_is_canonical_not_caller_order(client: TestClient, db: Session) -> None:
    """Two exports of the same meeting must read the same, however the query
    string was spelled."""
    meeting = make_full_meeting(db)

    response = client.get(
        _export_url(meeting.id), params={"format": "md", "include": "transcript,summary"}
    )

    body = response.text
    assert body.index("## Meeting Overview") < body.index("## Transcript")


def test_unknown_include_section_is_a_422(client: TestClient, db: Session) -> None:
    meeting = make_full_meeting(db)

    response = client.get(
        _export_url(meeting.id), params={"format": "md", "include": "summary,minutes"}
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["details"]["include"] == ["minutes"]
    assert "summary" in body["error"]["details"]["allowed"]


def test_unknown_format_is_a_422(client: TestClient, db: Session) -> None:
    meeting = make_full_meeting(db)

    response = client.get(_export_url(meeting.id), params={"format": "epub"})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "format" in body["error"]["details"]


def test_empty_include_is_a_400_not_an_empty_file(client: TestClient, db: Session) -> None:
    """Parsed fine, still not allowed — the BadRequestError side of the split."""
    meeting = make_full_meeting(db)

    response = client.get(_export_url(meeting.id), params={"format": "md", "include": ""})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "EMPTY_INCLUDE"


def test_unbuilt_sections_are_accepted_and_render_nothing(client: TestClient, db: Session) -> None:
    """`comments` and `highlights` land on parallel branches (T-31/T-32); the
    include vocabulary already admits them so those branches never touch this
    endpoint's contract."""
    meeting = make_full_meeting(db)

    response = client.get(
        _export_url(meeting.id),
        params={"format": "md", "include": "summary,comments,highlights"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert "## Meeting Overview" in response.text
    assert "Comments" not in response.text
    assert "Highlights" not in response.text


def test_register_section_rejects_a_key_outside_the_vocabulary() -> None:
    """A registration typo must fail loudly, not create an unvalidated value."""
    with pytest.raises(ValueError, match="minutes"):
        register_section("minutes", lambda _db, _meeting: None)


# ── T34-E · filename sanitisation ───────────────────────────────────────────


def test_t34_e_traversal_title_is_sanitised(client: TestClient, db: Session) -> None:
    meeting = make_meeting(db, title="Q3 / Roadmap ../etc")
    db.commit()

    response = client.get(_export_url(meeting.id), params={"format": "md"})

    disposition = response.headers["content-disposition"]
    assert disposition == 'attachment; filename="q3-roadmap-etc-2026-07-24.md"'
    filename = disposition.split('filename="')[1].rstrip('"')
    assert "/" not in filename
    assert "\\" not in filename
    assert ".." not in filename


def test_t34_e_emoji_title_slugs_to_its_words(client: TestClient, db: Session) -> None:
    meeting = make_meeting(db, title="🔥 Sprint Review 🔥")
    db.commit()

    response = client.get(_export_url(meeting.id), params={"format": "md"})

    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="sprint-review-2026-07-24.md"'
    )


@pytest.mark.parametrize(
    ("title", "slug"),
    [
        ("Q3 / Roadmap ../etc", "q3-roadmap-etc"),
        ("Weekly   Growth\tReview", "weekly-growth-review"),
        ("Café Sync — Résumé", "cafe-sync-resume"),
        ("..\\..\\windows\\system32", "windows-system32"),
        ("🔥🔥🔥", "meeting"),
    ],
)
def test_slugify_whitelists_to_ascii_kebab(title: str, slug: str) -> None:
    assert slugify(title) == slug


def test_export_filename_caps_the_whole_name_at_100_chars() -> None:
    name = export_filename("a" * 300, date(2026, 7, 24), "docx")
    assert len(name) <= 100
    assert name.endswith("-2026-07-24.docx")


# ── T34-F · a 1,200-segment export ──────────────────────────────────────────


def test_t34_f_1200_segment_pdf_completes_fast_with_stable_memory(
    client: TestClient, db: Session
) -> None:
    """The seed maxes out at 159 segments, so the T34-F meeting is synthesised.

    Timing and memory are measured on separate requests: tracemalloc slows
    every allocation, and folding its overhead into the timed run would fail
    the 5-second budget for reasons that are not the code's.
    """
    user = make_user(db)
    meeting = make_meeting(db, host=user)
    speakers = [
        make_speaker(db, meeting, label=f"Speaker {i + 1}", color_index=i) for i in range(3)
    ]
    make_segments(db, meeting, speakers, count=1200)
    make_summary(db, meeting)
    db.commit()

    started = time.perf_counter()
    response = client.get(_export_url(meeting.id), params={"format": "pdf"})
    elapsed = time.perf_counter() - started

    assert response.status_code == status.HTTP_200_OK
    assert response.content.startswith(b"%PDF-")
    assert _pdf_pages(response.content) > 10
    assert elapsed < 5.0, f"1,200-segment PDF took {elapsed:.2f}s"

    tracemalloc.start()
    client.get(_export_url(meeting.id), params={"format": "pdf"})
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    # Generous, but a buffering regression (the whole render held twice, an
    # O(n²) string build) blows straight past it. Measured peak is ~8 MB.
    assert peak < 64 * 1024 * 1024, f"peak allocation {peak / 1e6:.0f} MB"


# ── DOCX ────────────────────────────────────────────────────────────────────


def test_docx_export_opens_and_carries_checkbox_glyphs(client: TestClient, db: Session) -> None:
    meeting = make_full_meeting(db)
    _complete_first_action_item(db, meeting.id)
    assert meeting.summary is not None
    _add_note_sections(db, meeting.id, meeting.summary.id)

    response = client.get(_export_url(meeting.id), params={"format": "docx"})

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == DOCX_MEDIA_TYPE
    assert response.content.startswith(b"PK\x03\x04")

    document = docx.Document(io.BytesIO(response.content))
    texts = [paragraph.text for paragraph in document.paragraphs]
    joined = "\n".join(texts)
    assert "Q3 Product Roadmap Sync" in texts
    assert "Action Items" in texts
    assert "☑ Follow up on item 1" in joined
    assert "☐ Follow up on item 2" in joined
    assert re.search(r"Speaker 1 \[00:00\] We should revisit", joined)


# ── 404 / 410 ───────────────────────────────────────────────────────────────


def test_export_of_a_deleted_meeting_answers_410(client: TestClient, db: Session) -> None:
    """Never an export of a deleted meeting, never an empty file."""
    meeting = make_full_meeting(db)
    client.delete(f"/api/v1/meetings/{meeting.id}")

    response = client.get(_export_url(meeting.id), params={"format": "md"})

    assert response.status_code == status.HTTP_410_GONE
    assert response.json()["error"]["code"] == "MEETING_DELETED"


def test_export_of_an_unknown_meeting_answers_404(client: TestClient, db: Session) -> None:
    make_user(db)
    db.commit()

    response = client.get(_export_url(99999), params={"format": "md"})

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["error"]["code"] == "MEETING_NOT_FOUND"


def test_export_of_an_unsummarised_meeting_still_renders(client: TestClient, db: Session) -> None:
    """ADR-046: no summary is a state, not an error — the generators skip the
    empty sections rather than crashing or printing bare headings."""
    user = make_user(db)
    meeting = make_meeting(db, host=user)
    speaker = make_speaker(db, meeting)
    make_segments(db, meeting, [speaker], count=5)
    db.commit()

    response = client.get(_export_url(meeting.id), params={"format": "md"})

    assert response.status_code == status.HTTP_200_OK
    assert "## Transcript" in response.text
    assert "## Meeting Overview" not in response.text


# ── T34.9 · bulk zip ────────────────────────────────────────────────────────


def test_bulk_export_zips_one_file_per_meeting(client: TestClient, db: Session) -> None:
    user = make_user(db)
    titles = ("Weekly Growth Review", "Incident Postmortem", "Hiring Sync")
    meetings = []
    for offset, title in enumerate(titles):
        meeting = make_meeting(
            db, host=user, title=title, started_at=datetime(2026, 7, 20 + offset, 9, 0, tzinfo=UTC)
        )
        speaker = make_speaker(db, meeting)
        make_segments(db, meeting, [speaker], count=5)
        meetings.append(meeting)
    db.commit()

    response = client.get(
        "/api/v1/meetings/export",
        params={"ids": ",".join(str(m.id) for m in meetings), "format": "md"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == "application/zip"
    today = datetime.now(UTC).date().isoformat()
    assert (
        response.headers["content-disposition"]
        == f'attachment; filename="meetings-export-{today}.zip"'
    )

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.namelist() == [
            "weekly-growth-review-2026-07-20.md",
            "incident-postmortem-2026-07-21.md",
            "hiring-sync-2026-07-22.md",
        ]
        first = archive.read("weekly-growth-review-2026-07-20.md").decode("utf-8")
        assert first.startswith("# Weekly Growth Review\n")


def test_bulk_export_route_is_not_captured_as_a_meeting_id(client: TestClient, db: Session) -> None:
    """The route-order guard: `/meetings/export` must reach the zip handler,
    never die as a 422 parsing `"export"` into `{meeting_id}`."""
    meeting = make_full_meeting(db)

    response = client.get(
        "/api/v1/meetings/export", params={"ids": str(meeting.id), "format": "md"}
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == "application/zip"


def test_bulk_export_names_every_missing_or_deleted_id(client: TestClient, db: Session) -> None:
    user = make_user(db)
    kept = make_meeting(db, host=user, title="Kept")
    removed = make_meeting(db, host=user, title="Removed")
    db.commit()
    client.delete(f"/api/v1/meetings/{removed.id}")

    response = client.get(
        "/api/v1/meetings/export",
        params={"ids": f"{kept.id},{removed.id},99999", "format": "md"},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    body = response.json()
    assert body["error"]["code"] == "MEETING_NOT_FOUND"
    assert body["error"]["details"]["missing"] == [99999]
    assert body["error"]["details"]["deleted"] == [removed.id]


def test_bulk_export_deduplicates_colliding_filenames(client: TestClient, db: Session) -> None:
    """Two meetings titled alike on the same day must both survive the zip."""
    user = make_user(db)
    first = make_meeting(db, host=user, title="Daily Standup")
    second = make_meeting(db, host=user, title="Daily Standup")
    db.commit()

    response = client.get(
        "/api/v1/meetings/export",
        params={"ids": f"{first.id},{second.id}", "format": "md"},
    )

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.namelist() == [
            "daily-standup-2026-07-24.md",
            "daily-standup-2026-07-24-2.md",
        ]


def test_bulk_export_with_unparseable_ids_is_a_422(client: TestClient, db: Session) -> None:
    make_user(db)
    db.commit()

    response = client.get("/api/v1/meetings/export", params={"ids": "1,evil", "format": "md"})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
