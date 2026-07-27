"""Parsing uploaded and pasted transcripts (T-26.3 to T-26.6).

ON THE SERVER, not in the browser, and deliberately.

The preview the user confirms has to be exactly what gets created — so either
the parser runs once on the server and the client asks it for a preview, or it
runs twice and the two versions drift. Running it here also means the file
checks in T-26.13 are real: a client that lies about an extension is checked
against the CONTENT, which is the only check that cannot be bypassed.

Every parser returns the same `ParsedTranscript`, so the caller does not care
which format arrived.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from itertools import pairwise

#: Refused outright. A transcript with more lines than this is a data dump.
MAX_SEGMENTS = 10_000

#: Words per minute used when a format carries no timings (T-26.5).
#: 150 is conversational speech; podcast and dictation guides put it at 140-160.
WORDS_PER_MINUTE = 150

#: Where a synthesised speaker's lines are attributed.
DEFAULT_SPEAKER = "Speaker 1"


class TranscriptParseError(Exception):
    """The content is not a transcript this app can read."""

    def __init__(self, message: str, *, hint: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint


@dataclass(slots=True)
class ParsedSegment:
    speaker: str
    start_ms: int
    end_ms: int
    text: str


@dataclass(slots=True)
class ParsedTranscript:
    segments: list[ParsedSegment]
    #: Which rule matched, shown in the preview so the user can see we guessed.
    strategy: str
    title: str | None = None
    participants: list[str] = field(default_factory=list)

    @property
    def speakers(self) -> list[str]:
        """Distinct speakers, in the order they first speak."""
        seen: dict[str, None] = {}
        for segment in self.segments:
            seen.setdefault(segment.speaker, None)
        return list(seen)

    @property
    def duration_ms(self) -> int:
        return max((segment.end_ms for segment in self.segments), default=0)


# ── Timestamps ───────────────────────────────────────────────────────────────

_VTT_TIME = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})")


def _to_ms(hours: str | None, minutes: str, seconds: str, fraction: str) -> int:
    # Padded, not multiplied: `.5` is 500ms and `.05` is 50ms, and treating the
    # digits as a count of milliseconds gets both wrong.
    millis = int(fraction.ljust(3, "0"))
    return ((int(hours or 0) * 60 + int(minutes)) * 60 + int(seconds)) * 1000 + millis


def _parse_cue_times(line: str) -> tuple[int, int] | None:
    """`00:00:14.500 --> 00:00:18.200`, in either the VTT or SRT spelling."""
    if "-->" not in line:
        return None

    left, _, right = line.partition("-->")
    start = _VTT_TIME.search(left)
    end = _VTT_TIME.search(right)
    if not start or not end:
        return None

    return _to_ms(*start.groups()), _to_ms(*end.groups())


# ── Speaker extraction ───────────────────────────────────────────────────────

_VOICE_TAG = re.compile(r"<v\s+([^>]+)>(.*)", re.IGNORECASE | re.DOTALL)
#: `Sarah Chen: text`. Bounded, so a sentence containing a colon — "the point
#: is: we ship" — is not read as a speaker called "the point is".
#: The curly apostrophe is written as an escape rather than typed: ruff reads
#: the literal as ambiguous with a backtick, and names really do contain one
#: (O\u2019Brien).
_NAME_CHAR = "[\\w.'\u2019-]"
_SPEAKER_PREFIX = re.compile(
    rf"^([A-Z]{_NAME_CHAR}*(?:\s+[A-Z]{_NAME_CHAR}*){{0,3}})\s*:\s*(.+)", re.DOTALL
)


def _split_speaker(text: str) -> tuple[str | None, str]:
    voice = _VOICE_TAG.match(text.strip())
    if voice:
        return voice.group(1).strip(), voice.group(2).strip().removesuffix("</v>").strip()

    prefix = _SPEAKER_PREFIX.match(text.strip())
    if prefix:
        return prefix.group(1).strip(), prefix.group(2).strip()

    return None, text.strip()


# ── Formats ──────────────────────────────────────────────────────────────────


def parse_vtt(content: str) -> ParsedTranscript:
    """WebVTT (T-26.3).

    Cue identifiers are optional and ignored; what matters is the timing line
    and the payload under it. Speakers come from `<v Name>` voice tags or from
    the `Name: text` convention, because real exports use both.
    """
    lines = content.splitlines()
    segments: list[ParsedSegment] = []

    index = 0
    while index < len(lines):
        times = _parse_cue_times(lines[index])
        if times is None:
            index += 1
            continue

        start, end = times
        index += 1

        payload: list[str] = []
        while index < len(lines) and lines[index].strip():
            payload.append(lines[index])
            index += 1

        speaker, text = _split_speaker("\n".join(payload))
        if text:
            segments.append(
                ParsedSegment(
                    speaker=speaker or DEFAULT_SPEAKER, start_ms=start, end_ms=end, text=text
                )
            )

    if not segments:
        raise TranscriptParseError(
            "We couldn't find any cues in that WebVTT file.",
            hint="A cue needs a timing line like 00:00:14.500 --> 00:00:18.200.",
        )

    return ParsedTranscript(segments=segments, strategy="webvtt")


def parse_srt(content: str) -> ParsedTranscript:
    """SubRip (T-26.4).

    Numbered blocks separated by blank lines, with a comma before the
    milliseconds. The block number is discarded — it is a sequence, and the
    order of the cues already carries that.
    """
    segments: list[ParsedSegment] = []

    for block in re.split(r"\n\s*\n", content.strip()):
        lines = [line for line in block.splitlines() if line.strip()]
        if not lines:
            continue

        # Drop a leading block number.
        if lines[0].strip().isdigit():
            lines = lines[1:]
        if not lines:
            continue

        times = _parse_cue_times(lines[0])
        if times is None:
            continue

        speaker, text = _split_speaker("\n".join(lines[1:]))
        if text:
            segments.append(
                ParsedSegment(
                    speaker=speaker or DEFAULT_SPEAKER,
                    start_ms=times[0],
                    end_ms=times[1],
                    text=text,
                )
            )

    if not segments:
        raise TranscriptParseError(
            "We couldn't find any subtitles in that SRT file.",
            hint="Each block needs a timing line like 00:00:14,500 --> 00:00:18,200.",
        )

    return ParsedTranscript(segments=segments, strategy="subrip")


_BRACKET_LINE = re.compile(r"^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)")
_BARE_TIME_LINE = re.compile(r"^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*)")


def _clock_to_ms(clock: str) -> int:
    parts = [int(part) for part in clock.split(":")]
    if len(parts) == 3:
        return ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000
    return (parts[0] * 60 + parts[1]) * 1000


def parse_txt(content: str) -> ParsedTranscript:
    """Plain text, by four heuristics tried in order (T-26.5).

    The strategy that matched is reported back, because a transcript whose
    timings were INVENTED should say so rather than presenting guesses as
    facts.
    """
    lines = [line for line in content.splitlines() if line.strip()]
    if not lines:
        raise TranscriptParseError("That file is empty.")

    timed: list[ParsedSegment] = []
    strategy = ""

    for line in lines:
        bracket = _BRACKET_LINE.match(line.strip())
        bare = None if bracket else _BARE_TIME_LINE.match(line.strip())
        match = bracket or bare
        if not match:
            continue

        speaker, text = _split_speaker(match.group(2))
        if not text:
            continue

        timed.append(
            ParsedSegment(
                speaker=speaker or DEFAULT_SPEAKER,
                start_ms=_clock_to_ms(match.group(1)),
                # Provisional: replaced below by the next line's start, so the
                # segments abut instead of every one lasting a nominal second.
                end_ms=_clock_to_ms(match.group(1)) + 1000,
                text=text,
            )
        )
        strategy = "bracketed-timestamps" if bracket else "leading-timestamps"

    if timed:
        _close_gaps(timed)
        return ParsedTranscript(segments=timed, strategy=strategy)

    # No timings anywhere: `Name: text`, or paragraphs.
    speaker_lines = [_split_speaker(line) for line in lines]
    named = [(speaker, text) for speaker, text in speaker_lines if speaker]

    if named and len(named) >= len(lines) / 2:
        return ParsedTranscript(
            segments=_synthesise(
                [(speaker or DEFAULT_SPEAKER, text) for speaker, text in speaker_lines]
            ),
            strategy="speaker-prefixes",
        )

    return ParsedTranscript(
        segments=_synthesise([(DEFAULT_SPEAKER, line.strip()) for line in lines]),
        strategy="paragraphs",
    )


def _close_gaps(segments: list[ParsedSegment]) -> None:
    """Make each segment run until the next one starts."""
    for current, following in pairwise(segments):
        if following.start_ms > current.start_ms:
            current.end_ms = following.start_ms


def _synthesise(lines: list[tuple[str, str]]) -> list[ParsedSegment]:
    """Timings from reading speed, when the source has none (T-26.5).

    Strictly increasing and never zero-length: a segment that starts and ends
    at the same millisecond breaks the player's active-line resolution and the
    seekbar's chapter positions at once.
    """
    segments: list[ParsedSegment] = []
    cursor = 0

    for speaker, text in lines:
        words = max(1, len(text.split()))
        duration = max(1000, round(words / WORDS_PER_MINUTE * 60_000))
        segments.append(
            ParsedSegment(speaker=speaker, start_ms=cursor, end_ms=cursor + duration, text=text)
        )
        cursor += duration

    return segments


def parse_json(content: str) -> ParsedTranscript:
    """The documented schema (T-26.6), tolerant of seconds instead of ms."""
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as error:
        raise TranscriptParseError(
            "That file is not valid JSON.", hint=f"Parser said: {error.msg} at line {error.lineno}."
        ) from error

    if not isinstance(payload, dict) or not isinstance(payload.get("segments"), list):
        raise TranscriptParseError(
            "That JSON does not look like a transcript.",
            hint='It needs a top-level "segments" array. See docs/transcript-schema.json.',
        )

    segments: list[ParsedSegment] = []
    for raw in payload["segments"]:
        if not isinstance(raw, dict):
            continue

        text = str(raw.get("text", "")).strip()
        if not text:
            continue

        segments.append(
            ParsedSegment(
                speaker=str(raw.get("speaker") or DEFAULT_SPEAKER).strip() or DEFAULT_SPEAKER,
                start_ms=_ms_field(raw, "start"),
                end_ms=_ms_field(raw, "end"),
                text=text,
            )
        )

    if not segments:
        raise TranscriptParseError("That JSON has no usable segments.")

    participants = [
        str(name).strip()
        for name in payload.get("participants", [])
        if isinstance(name, str) and name.strip()
    ]

    return ParsedTranscript(
        segments=segments,
        strategy="json",
        title=str(payload["title"]).strip() if isinstance(payload.get("title"), str) else None,
        participants=participants,
    )


def _ms_field(raw: dict[str, object], prefix: str) -> int:
    """`start_ms`, or `start` in seconds — both are in the wild.

    Seconds are detected by the KEY, not by the magnitude: guessing from the
    value would read a 90-minute recording's `5400` as 5.4 seconds or as 90
    minutes depending on which way the threshold fell.
    """
    exact = raw.get(f"{prefix}_ms")
    if isinstance(exact, (int, float)):
        return max(0, int(exact))

    seconds = raw.get(prefix)
    if isinstance(seconds, (int, float)):
        return max(0, int(seconds * 1000))

    return 0


# ── Entry point ──────────────────────────────────────────────────────────────

PARSERS = {
    "vtt": parse_vtt,
    "srt": parse_srt,
    "txt": parse_txt,
    "json": parse_json,
}

SUPPORTED_EXTENSIONS = tuple(PARSERS)


def parse_transcript(content: str, *, extension: str) -> ParsedTranscript:
    """Parse by extension, then validate the result.

    The extension chooses the parser; it does not certify the content. A `.exe`
    renamed to `.txt` reaches the text parser and fails there, on what it
    actually contains — which is the only check a client cannot lie its way
    past (T-26.13).
    """
    parser = PARSERS.get(extension.lower().lstrip("."))
    if parser is None:
        raise TranscriptParseError(
            f"We can't read .{extension.lstrip('.')} files.",
            hint=f"Supported formats: {', '.join(f'.{ext}' for ext in SUPPORTED_EXTENSIONS)}.",
        )

    if not content.strip():
        raise TranscriptParseError("That file is empty.")

    if "\x00" in content[:4096]:
        # A binary file renamed to `.txt`. Caught before the text parser turns
        # a megabyte of bytes into a thousand nonsense "segments".
        raise TranscriptParseError(
            "That file looks like binary data, not text.",
            hint="Export the transcript as .txt, .vtt, .srt or .json first.",
        )

    parsed = parser(content)

    if len(parsed.segments) > MAX_SEGMENTS:
        raise TranscriptParseError(
            f"That transcript has {len(parsed.segments):,} lines, "
            f"which is more than the {MAX_SEGMENTS:,} we import."
        )

    return parsed
