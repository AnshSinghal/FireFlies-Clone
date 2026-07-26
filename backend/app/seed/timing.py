"""Derive segment timings from text (T-05.4).

The transcript fixtures carry only a speaker and a line. Timings are computed
here, which is deliberate: hand-written millisecond offsets across ~700 segments
would be wrong within a week of the first edit, and every edit would risk
introducing the overlap that test T05-C exists to catch.

Everything is DETERMINISTIC. `random` would make the visual-regression baselines
in T-41 unusable — the same seed run twice must produce byte-identical timings.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import pairwise

#: Conversational speech, not presentation pace. Real speakers run 140-160.
WORDS_PER_MINUTE = 150

#: Inter-speaker gap.
#:
#: PLAN.md T-05.4 suggests 200-600ms, which is the rhythm of a fast two-person
#: conversation. A meeting is not that: there is thinking time, someone
#: unmuting, a slide changing, a pause while a question lands. Timing the real
#: exchanges in these fixtures against that assumption produced meetings of four
#: to six minutes, which reads as obviously synthetic.
#:
#: A fixed gap also makes a transcript feel mechanical when scrubbed, so this
#: varies across the range.
MIN_GAP_MS = 700
MAX_GAP_MS = 2600

#: Even a one-word interjection ("Agreed.") occupies time on the timeline.
MIN_SEGMENT_MS = 900


@dataclass(frozen=True, slots=True)
class TimedSegment:
    speaker: str
    text: str
    start_ms: int
    end_ms: int
    sequence: int

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms


def speech_duration_ms(text: str) -> int:
    """How long a line takes to say, floored so short interjections still land."""
    words = len(text.split())
    spoken = int(words / WORDS_PER_MINUTE * 60_000)
    return max(spoken, MIN_SEGMENT_MS)


def _gap_ms(seed: str, index: int) -> int:
    """A stable pseudo-random gap in [MIN_GAP_MS, MAX_GAP_MS].

    Derived from the meeting key and the segment index rather than drawn from a
    random source, so re-running the seeder reproduces identical timings.
    """
    span = MAX_GAP_MS - MIN_GAP_MS + 1
    # FNV-1a over the composite key — the same hash family used for speaker
    # colours, for no reason other than consistency.
    h = 2166136261
    for char in f"{seed}:{index}":
        h ^= ord(char)
        h = (h * 16777619) & 0xFFFFFFFF
    return MIN_GAP_MS + (h % span)


def build_timeline(
    lines: list[tuple[str, str]], *, seed: str, start_offset_ms: int = 0
) -> list[TimedSegment]:
    """Lay speaker lines onto a strictly-ordered, non-overlapping timeline.

    Consecutive lines from the SAME speaker get a shorter gap than a genuine
    speaker change — someone continuing their own thought does not pause as long
    as they do handing over. It costs nothing and makes scrubbing feel right.
    """
    segments: list[TimedSegment] = []
    cursor = start_offset_ms
    previous_speaker: str | None = None

    for index, (speaker, text) in enumerate(lines):
        if index > 0:
            gap = _gap_ms(seed, index)
            if speaker == previous_speaker:
                gap //= 2
            cursor += gap

        duration = speech_duration_ms(text)
        segments.append(
            TimedSegment(
                speaker=speaker,
                text=text,
                start_ms=cursor,
                end_ms=cursor + duration,
                sequence=index,
            )
        )
        cursor += duration
        previous_speaker = speaker

    return segments


def assert_well_formed(segments: list[TimedSegment]) -> None:
    """Fail loudly at seed time rather than shipping a broken timeline.

    T05-C asserts this from the database side. Checking it here as well means a
    bad fixture is caught by the person who wrote it, with the offending
    sequence number in the message, rather than by a test run later.
    """
    for previous, current in pairwise(segments):
        if current.start_ms < previous.end_ms:
            raise ValueError(
                f"segments overlap at sequence {current.sequence}: "
                f"{previous.end_ms}ms > {current.start_ms}ms"
            )
        if current.sequence != previous.sequence + 1:
            raise ValueError(f"sequence gap before {current.sequence}")
        if current.end_ms <= current.start_ms:
            raise ValueError(f"segment {current.sequence} has non-positive duration")


def talk_time_by_speaker(segments: list[TimedSegment]) -> dict[str, int]:
    """Seconds spoken per speaker — the source for participants.talk_seconds.

    Computed rather than authored (T-05.10), so it cannot drift from the
    transcript it describes.
    """
    totals: dict[str, int] = {}
    for segment in segments:
        totals[segment.speaker] = totals.get(segment.speaker, 0) + segment.duration_ms
    return {speaker: ms // 1000 for speaker, ms in totals.items()}
