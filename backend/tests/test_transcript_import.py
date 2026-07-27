"""Transcript parsing (T-26.3 to T-26.6).

Pure functions with no database, so they are tested directly rather than
through the API — which is also why the parsers live in their own module.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.transcript_import import (
    MAX_SEGMENTS,
    TranscriptParseError,
    parse_transcript,
)
from tests.factories import make_user


class TestWebVtt:
    def test_reads_cues_with_voice_tags(self) -> None:
        parsed = parse_transcript(
            """WEBVTT

00:00:14.500 --> 00:00:18.200
<v Sarah Chen>Good morning everyone.

00:00:18.400 --> 00:00:22.000
<v Marcus Patel>Morning. Shall we start?
""",
            extension="vtt",
        )

        assert parsed.strategy == "webvtt"
        assert [segment.speaker for segment in parsed.segments] == ["Sarah Chen", "Marcus Patel"]
        assert parsed.segments[0].start_ms == 14_500
        assert parsed.segments[0].end_ms == 18_200
        assert parsed.segments[0].text == "Good morning everyone."

    def test_reads_the_name_colon_convention_too(self) -> None:
        """Real exports use both, so both are supported."""
        parsed = parse_transcript(
            """WEBVTT

00:00.000 --> 00:04.000
Sarah Chen: Let's begin.
""",
            extension="vtt",
        )

        assert parsed.segments[0].speaker == "Sarah Chen"
        assert parsed.segments[0].text == "Let's begin."

    def test_ignores_cue_identifiers(self) -> None:
        parsed = parse_transcript(
            """WEBVTT

intro-1
00:00.000 --> 00:02.000
Hello.
""",
            extension="vtt",
        )

        assert len(parsed.segments) == 1
        assert parsed.segments[0].text == "Hello."

    def test_pads_fractional_seconds_rather_than_multiplying(self) -> None:
        # `.5` is 500ms. Reading the digits as a count of milliseconds makes it
        # 5ms, and every timestamp in the file lands in the wrong place.
        parsed = parse_transcript("WEBVTT\n\n00:00.5 --> 00:01.05\nHi.\n", extension="vtt")
        assert parsed.segments[0].start_ms == 500
        assert parsed.segments[0].end_ms == 1_050

    def test_a_file_with_no_cues_is_an_error_with_a_hint(self) -> None:
        with pytest.raises(TranscriptParseError) as error:
            parse_transcript("WEBVTT\n\nnot a cue\n", extension="vtt")
        assert error.value.hint is not None


class TestSubRip:
    def test_reads_numbered_blocks_with_comma_separators(self) -> None:
        parsed = parse_transcript(
            """1
00:00:14,500 --> 00:00:18,200
Sarah Chen: Good morning.

2
00:00:18,400 --> 00:00:22,000
Marcus Patel: Morning.
""",
            extension="srt",
        )

        assert parsed.strategy == "subrip"
        assert len(parsed.segments) == 2
        assert parsed.segments[0].start_ms == 14_500
        assert parsed.segments[1].speaker == "Marcus Patel"

    def test_survives_blocks_without_numbers(self) -> None:
        parsed = parse_transcript("00:00:01,000 --> 00:00:02,000\nJust a line.\n", extension="srt")
        assert len(parsed.segments) == 1


class TestPlainText:
    def test_bracketed_timestamps_are_honoured(self) -> None:
        parsed = parse_transcript(
            "[00:14] Sarah Chen: Good morning.\n[00:22] Marcus Patel: Morning.\n",
            extension="txt",
        )

        assert parsed.strategy == "bracketed-timestamps"
        assert parsed.segments[0].start_ms == 14_000
        # Each line runs until the next begins, rather than a nominal second.
        assert parsed.segments[0].end_ms == 22_000

    def test_leading_timestamps_are_honoured(self) -> None:
        parsed = parse_transcript(
            "00:14 Sarah Chen: Good morning.\n00:22 Marcus Patel: Morning.\n",
            extension="txt",
        )
        assert parsed.strategy == "leading-timestamps"
        assert parsed.segments[0].start_ms == 14_000

    def test_speaker_prefixes_get_synthesised_timings(self) -> None:
        parsed = parse_transcript(
            "Sarah Chen: Good morning everyone and welcome.\nMarcus Patel: Morning.\n",
            extension="txt",
        )

        assert parsed.strategy == "speaker-prefixes"
        assert [segment.speaker for segment in parsed.segments] == ["Sarah Chen", "Marcus Patel"]
        # Strictly increasing and never zero-length — the player resolves the
        # active line from these, and a zero-length segment breaks it.
        assert parsed.segments[0].start_ms == 0
        assert parsed.segments[0].end_ms > 0
        assert parsed.segments[1].start_ms == parsed.segments[0].end_ms

    def test_paragraphs_become_one_speaker(self) -> None:
        parsed = parse_transcript(
            "We talked about pricing.\nThen we talked about hiring.\n", extension="txt"
        )

        assert parsed.strategy == "paragraphs"
        assert parsed.speakers == ["Speaker 1"]
        assert len(parsed.segments) == 2

    def test_a_sentence_containing_a_colon_is_not_a_speaker(self) -> None:
        """`the point is: we ship` is a sentence, not a line by "the point is"."""
        parsed = parse_transcript(
            "the point is: we ship on Friday.\nand nothing else matters.\n", extension="txt"
        )
        assert parsed.speakers == ["Speaker 1"]

    def test_synthesised_timings_are_plausible(self) -> None:
        # Twenty words at 150wpm is about eight seconds.
        line = "Sarah Chen: " + " ".join(["word"] * 20)
        parsed = parse_transcript(line, extension="txt")

        duration = parsed.segments[0].end_ms
        assert 6_000 < duration < 10_000


class TestJson:
    def test_reads_the_documented_schema(self) -> None:
        parsed = parse_transcript(
            """{
              "title": "Q3 Sync",
              "participants": ["Sarah Chen", "Marcus Patel"],
              "segments": [
                {"speaker": "Sarah Chen", "start_ms": 0, "end_ms": 4000, "text": "Morning."}
              ]
            }""",
            extension="json",
        )

        assert parsed.title == "Q3 Sync"
        assert parsed.participants == ["Sarah Chen", "Marcus Patel"]
        assert parsed.segments[0].end_ms == 4_000

    def test_accepts_seconds_when_the_key_says_seconds(self) -> None:
        parsed = parse_transcript(
            '{"segments": [{"speaker": "A", "start": 5.5, "end": 9, "text": "Hi."}]}',
            extension="json",
        )

        # Detected by the KEY, not by the magnitude — guessing from the value
        # would read a 90-minute recording's 5400 either way round.
        assert parsed.segments[0].start_ms == 5_500
        assert parsed.segments[0].end_ms == 9_000

    def test_malformed_json_says_where(self) -> None:
        with pytest.raises(TranscriptParseError) as error:
            parse_transcript('{"segments": [', extension="json")
        assert error.value.hint is not None
        assert "line" in error.value.hint

    def test_json_without_segments_is_rejected(self) -> None:
        with pytest.raises(TranscriptParseError):
            parse_transcript('{"title": "No segments here"}', extension="json")


class TestGuards:
    def test_an_unsupported_extension_lists_what_is_supported(self) -> None:
        with pytest.raises(TranscriptParseError) as error:
            parse_transcript("anything", extension="pdf")
        assert ".vtt" in (error.value.hint or "")

    def test_an_empty_file_is_rejected(self) -> None:
        with pytest.raises(TranscriptParseError):
            parse_transcript("   \n\n  ", extension="txt")

    def test_binary_content_is_caught_whatever_it_is_called(self) -> None:
        """A `.exe` renamed to `.txt` (T26-P).

        The extension chooses the parser; it does not certify the content.
        """
        with pytest.raises(TranscriptParseError) as error:
            parse_transcript("MZ\x90\x00\x03\x00\x00\x00binary junk", extension="txt")
        assert "binary" in error.value.message.lower()

    def test_too_many_segments_is_refused(self) -> None:
        content = "\n".join(f"Speaker One: line {i}" for i in range(MAX_SEGMENTS + 5))
        with pytest.raises(TranscriptParseError) as error:
            parse_transcript(content, extension="txt")
        assert "more than" in error.value.message


class TestParseEndpoint:
    """The dry run behind the preview (T-26.7, T-26.13)."""

    def test_a_pasted_transcript_comes_back_parsed(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/meetings/parse",
            data={"text": "Sarah Chen: Morning.\nMarcus Patel: Morning.", "extension": "txt"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["strategy"] == "speaker-prefixes"
        assert body["speakers"] == ["Sarah Chen", "Marcus Patel"]
        assert body["duration_ms"] > 0

    def test_an_uploaded_file_comes_back_parsed(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/meetings/parse",
            files={
                "file": (
                    "meeting.vtt",
                    b"WEBVTT\n\n00:00.000 --> 00:04.000\n<v Ada>Hello.\n",
                    "text/vtt",
                )
            },
        )

        assert response.status_code == 200
        assert response.json()["speakers"] == ["Ada"]

    def test_nothing_is_written(self, client: TestClient) -> None:
        """A preview is a question, not a request to create anything."""
        before = client.get("/api/v1/meetings").json()["total"]
        client.post("/api/v1/meetings/parse", data={"text": "A: Hi.", "extension": "txt"})
        assert client.get("/api/v1/meetings").json()["total"] == before

    def test_an_executable_renamed_to_txt_is_refused(self, client: TestClient) -> None:
        """T26-P, at the only layer a client cannot lie to.

        Two guards catch this, and which one fires depends on the bytes.
        Undecodable ones — an actual executable — stop at the UTF-8 decode with
        the message below. Bytes that happen to decode but still contain NULs
        reach the parser, which refuses them there (see
        `test_binary_content_is_caught_whatever_it_is_called`).
        """
        response = client.post(
            "/api/v1/meetings/parse",
            files={
                "file": ("payload.txt", b"MZ\x90\x00\x03\x00\x00\x00\xff\xfe binary", "text/plain")
            },
        )

        assert response.status_code == 422
        assert "isn't text" in response.json()["error"]["message"]

    def test_decodable_binary_is_caught_by_the_parser(self, client: TestClient) -> None:
        """The other half of the same guard: valid UTF-8 that is not a transcript."""
        response = client.post(
            "/api/v1/meetings/parse",
            data={"text": "MZ\x00\x00\x00 garbage", "extension": "txt"},
        )

        assert response.status_code == 422
        assert "binary" in response.json()["error"]["message"].lower()

    def test_an_oversized_file_is_refused(self, client: TestClient) -> None:
        too_big = b"A: line\n" * 2_000_000
        response = client.post(
            "/api/v1/meetings/parse",
            files={"file": ("huge.txt", too_big, "text/plain")},
        )

        assert response.status_code == 422
        assert "MB" in response.json()["error"]["message"]

    def test_an_unparseable_file_carries_a_hint(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/meetings/parse",
            files={"file": ("notes.vtt", b"WEBVTT\n\nnothing useful here\n", "text/vtt")},
        )

        assert response.status_code == 422
        assert response.json()["error"]["details"]["hint"]


class TestImportEndpoint:
    """Creating a meeting and its transcript in one call.

    Every case seeds a host: `CurrentUser` resolves the demo user, and without
    one the API answers 503 NOT_SEEDED — which is the right answer to "who is
    creating this", just not the one under test here.
    """

    @pytest.fixture(autouse=True)
    def _host(self, db: Session) -> None:
        make_user(db)
        db.commit()

    def test_a_meeting_is_created_with_its_transcript(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/meetings/import",
            json={
                "title": "Imported sync",
                "segments": [
                    {"speaker": "Ada", "start_ms": 0, "end_ms": 4000, "text": "Morning."},
                    {"speaker": "Alan", "start_ms": 4000, "end_ms": 9000, "text": "Morning."},
                    {"speaker": "Ada", "start_ms": 9000, "end_ms": 12000, "text": "Shall we?"},
                ],
            },
        )

        assert response.status_code == 201
        meeting = response.json()
        # Derived from the last segment, never accepted from the client.
        assert meeting["duration_seconds"] == 12
        assert meeting["segment_count"] == 3

        page = client.get(f"/api/v1/meetings/{meeting['id']}/transcript").json()
        assert [segment["text"] for segment in page["segments"]] == [
            "Morning.",
            "Morning.",
            "Shall we?",
        ]
        # One speaker per distinct name, in first-appearance order.
        assert [speaker["label"] for speaker in page["speakers"]] == ["Ada", "Alan"]
        assert [speaker["color_index"] for speaker in page["speakers"]] == [0, 1]

    def test_everyone_who_spoke_becomes_a_participant(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/meetings/import",
            json={
                "title": "Imported",
                "participant_names": ["Ada"],
                "segments": [
                    {"speaker": "Ada", "start_ms": 0, "end_ms": 1000, "text": "Hi."},
                    {"speaker": "Grace", "start_ms": 1000, "end_ms": 2000, "text": "Hi."},
                ],
            },
        )

        names = {person["display_name"] for person in response.json()["participants"]}
        # Grace was not listed, but she spoke — so she was there.
        assert names == {"Ada", "Grace"}

    def test_a_blank_title_is_refused(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/meetings/import",
            json={
                "title": "   ",
                "segments": [{"speaker": "A", "start_ms": 0, "end_ms": 1, "text": "Hi."}],
            },
        )
        assert response.status_code == 422

    def test_a_zero_length_segment_is_given_a_floor(self, client: TestClient) -> None:
        """The timings came from a file we did not write.

        A segment that ends before it starts breaks the player's active-line
        resolution, so it is corrected rather than rejected.
        """
        response = client.post(
            "/api/v1/meetings/import",
            json={
                "title": "Odd timings",
                "segments": [{"speaker": "A", "start_ms": 5000, "end_ms": 0, "text": "Hi."}],
            },
        )

        meeting_id = response.json()["id"]
        segment = client.get(f"/api/v1/meetings/{meeting_id}/transcript").json()["segments"][0]
        assert segment["end_ms"] > segment["start_ms"]
