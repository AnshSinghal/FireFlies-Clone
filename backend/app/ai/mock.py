"""MockProvider — deterministic and genuinely useful (T-29.2).

Not `return "Lorem ipsum"`. Every method computes its answer from the
transcript with classical IR techniques, so the output reads like a real
summary of THAT meeting:

- keywords:      TF-IDF over segments against a stop-word list, top 6
- outline:       topic segmentation on long pauses + speaker-turn density
- overview:      extractive — TextRank-style sentence centrality, top 4
- action items:  commitment patterns with assignee and due-date inference
- answers:       top-k segment retrieval by term overlap, with timestamps

Everything is a pure function of the input — no clock, no randomness, no
network. Same transcript in, byte-identical result out (T29-A). That is what
makes it testable AND safe for the visual-regression snapshots in T-41.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from datetime import date, timedelta
from itertools import pairwise
from typing import TYPE_CHECKING

from app.ai.provider import AIProvider
from app.ai.types import (
    ActionItemResult,
    AnswerCitation,
    AnswerResult,
    KeywordResult,
    NoteGroupResult,
    OutlineEntryResult,
    SummaryResult,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from app.ai.types import ChatTurn, SegmentInput, Transcript

# ── Text primitives ─────────────────────────────────────────────────────────

#: Compact but honest stop-word list. Big enough that "the" never becomes a
#: keyword, small enough to read in one screen. Domain terms stay OUT of it —
#: filtering "meeting" from meeting transcripts would beg the question.
_STOP_WORD_TEXT = (
    "a about above after again all also am an and any are as at be because been "
    "before being below between both but by can could did do does doing down "
    "during each few for from further get got had has have having he her here "
    "hers him his how i if in into is it its itself just kind know like me more "
    "most my no nor not now of off on once only or other our out over own re "
    "really right said same she should so some such than that the their them "
    "then there these they this those through to too under until up very was we "
    "well were what when where which while who whom why will with would yeah yes "
    "you your"
)
_STOP_WORDS = frozenset(_STOP_WORD_TEXT.split(" "))

_WORD_RE = re.compile(r"[a-z][a-z'-]{2,}")
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


def _tokenize(text: str) -> list[str]:
    """Lowercased content words, stop words removed."""
    return [w for w in _WORD_RE.findall(text.lower()) if w not in _STOP_WORDS]


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_RE.split(text) if s.strip()]


def _mmss(ms: int) -> str:
    minutes, seconds = divmod(ms // 1000, 60)
    return f"{minutes:02d}:{seconds:02d}"


# ── Outline segmentation thresholds ─────────────────────────────────────────

#: A gap this long between turns is a topic boundary. 2s is roughly where a
#: conversational pause stops being breath and starts being a transition.
_PAUSE_MS = 2000
#: A pause-free run longer than this gets split at the speaker change nearest
#: its midpoint — the "speaker-turn density" half of the heuristic.
_MAX_CHUNK_SEGMENTS = 14
_MIN_OUTLINE_ENTRIES = 3

# ── Action-item patterns ────────────────────────────────────────────────────

#: Speaker is committing themselves → assignee is the speaker.
_FIRST_PERSON_RE = re.compile(
    r"\b(?:i'?ll|i will|i can (?:take|do|handle|own|draft|set up)|let me)\b", re.IGNORECASE
)
#: Speaker is delegating → assignee is a named participant if one appears.
_SECOND_PERSON_RE = re.compile(r"\b(?:can you|could you|would you mind)\b", re.IGNORECASE)
#: Group commitment → left unassigned; "Unassigned" is a real UI group.
_COLLECTIVE_RE = re.compile(
    r"\b(?:we need to|we should|we'll|let's|action item)\b", re.IGNORECASE
)

_WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}

_DUE_RE = re.compile(
    r"\bby (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|"
    r"eod|end of (?:the )?(?:day|week))\b|\btomorrow\b|\bnext week\b",
    re.IGNORECASE,
)


def _resolve_due(phrase: str, reference: date | None) -> date | None:
    """Turn "by Friday" into a date — only when there is a date to anchor on.

    `date.today()` is deliberately never consulted: it would make extraction
    output drift with the wall clock and break byte-identical determinism.
    """
    if reference is None:
        return None
    lowered = phrase.lower()
    if "tomorrow" in lowered:
        return reference + timedelta(days=1)
    if "next week" in lowered:
        return reference + timedelta(days=7)
    if "eod" in lowered or "end of the day" in lowered or "end of day" in lowered:
        return reference
    for name, weekday in _WEEKDAYS.items():
        if name in lowered:
            # "by Friday" said on a Friday means the coming one, not today.
            ahead = (weekday - reference.weekday() - 1) % 7 + 1
            return reference + timedelta(days=ahead)
    if "end of week" in lowered or "end of the week" in lowered:
        ahead = (4 - reference.weekday() - 1) % 7 + 1
        return reference + timedelta(days=ahead)
    return None


class MockProvider(AIProvider):
    """The default provider — free, instant, deterministic."""

    name = "mock"
    model = None

    # ── Keywords (TF-IDF) ───────────────────────────────────────────────

    def extract_keywords(self, transcript: Transcript) -> list[KeywordResult]:
        docs = [_tokenize(segment.text) for segment in transcript.segments]
        docs = [d for d in docs if d]
        if not docs:
            return []

        tf: Counter[str] = Counter()
        df: Counter[str] = Counter()
        for doc in docs:
            tf.update(doc)
            df.update(set(doc))

        n_docs = len(docs)
        scores = {
            term: count * math.log(n_docs / (1 + df[term]) + 1) for term, count in tf.items()
        }
        # Tie-break on the term itself so equal scores can't reorder between
        # runs — dict iteration order alone would be insertion-dependent.
        top = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:6]
        peak = top[0][1]
        return [KeywordResult(term=term, weight=round(score / peak, 4)) for term, score in top]

    # ── Outline (pause + speaker-turn segmentation) ─────────────────────

    def generate_outline(self, transcript: Transcript) -> list[OutlineEntryResult]:
        segments = transcript.segments
        if not segments:
            return []

        chunks = self._chunk_on_pauses(segments)
        if len(chunks) < _MIN_OUTLINE_ENTRIES:
            chunks = self._split_evenly(segments)
        chunks = [c for chunk in chunks for c in self._split_long(chunk)]

        entries: list[OutlineEntryResult] = []
        for chunk in chunks:
            title = self._title_for(chunk)
            start_ms = chunk[0].start_ms
            # start_ms is a real segment's start, so it always lands inside a
            # segment range (T29-D); enforcing strict increase guards against
            # two chunks opening on the same timestamp.
            if entries and start_ms <= entries[-1].start_ms:
                continue
            entries.append(OutlineEntryResult(title=title, start_ms=start_ms))
        return entries

    @staticmethod
    def _chunk_on_pauses(segments: Sequence[SegmentInput]) -> list[list[SegmentInput]]:
        chunks: list[list[SegmentInput]] = [[segments[0]]]
        for previous, current in pairwise(segments):
            if current.start_ms - previous.end_ms >= _PAUSE_MS:
                chunks.append([current])
            else:
                chunks[-1].append(current)
        return chunks

    @staticmethod
    def _split_evenly(segments: Sequence[SegmentInput]) -> list[list[SegmentInput]]:
        """Fallback for wall-to-wall audio with no usable pauses."""
        parts = min(4, max(_MIN_OUTLINE_ENTRIES, len(segments) // 8))
        parts = min(parts, len(segments))
        size = math.ceil(len(segments) / parts)
        return [list(segments[i : i + size]) for i in range(0, len(segments), size)]

    @staticmethod
    def _split_long(chunk: list[SegmentInput]) -> list[list[SegmentInput]]:
        """Split an over-long chunk at the speaker change nearest its middle."""
        if len(chunk) <= _MAX_CHUNK_SEGMENTS:
            return [chunk]
        middle = len(chunk) // 2
        turn_points = [
            i for i in range(1, len(chunk)) if chunk[i].speaker != chunk[i - 1].speaker
        ]
        if not turn_points:
            return [chunk]
        cut = min(turn_points, key=lambda i: (abs(i - middle), i))
        return MockProvider._split_long(chunk[:cut]) + MockProvider._split_long(chunk[cut:])

    @staticmethod
    def _title_for(chunk: Sequence[SegmentInput]) -> str:
        counts = Counter(_tokenize(" ".join(segment.text for segment in chunk)))
        top = [term for term, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:2]]
        if not top:
            return f"Discussion at {_mmss(chunk[0].start_ms)}"
        return " & ".join(term.capitalize() for term in top)

    # ── Overview (extractive, TextRank-style) ───────────────────────────

    def generate_summary(self, transcript: Transcript) -> SummaryResult:
        sentences = [s for segment in transcript.segments for s in _sentences(segment.text)]
        candidates = [(i, s, set(_tokenize(s))) for i, s in enumerate(sentences)]
        candidates = [(i, s, toks) for i, s, toks in candidates if len(toks) >= 4]

        if not candidates:
            # Empty-but-valid (T29-H): a summary of nothing says nothing,
            # rather than raising or inventing prose.
            return SummaryResult(overview=None, gist=None, notes=[], provider=self.name)

        # Degree centrality over token overlap — the sentence most similar to
        # everything else is the one that summarises the meeting.
        scores: dict[int, float] = {}
        for i, _, tokens in candidates:
            total = 0.0
            for j, _, other in candidates:
                if i == j:
                    continue
                union = len(tokens | other)
                if union:
                    total += len(tokens & other) / union
            scores[i] = total

        ranked = sorted(candidates, key=lambda c: (-scores[c[0]], c[0]))[:4]
        # Stitch in original speaking order so the paragraph reads forward.
        chosen = sorted(ranked, key=lambda c: c[0])
        overview = " ".join(sentence for _, sentence, _ in chosen)
        gist = chosen[0][1][:200]

        return SummaryResult(
            overview=overview,
            gist=gist,
            notes=self._notes(transcript),
            provider=self.name,
        )

    def _notes(self, transcript: Transcript) -> list[NoteGroupResult]:
        """One bullet per chapter: its most information-dense sentence."""
        outline = self.generate_outline(transcript)
        groups: list[NoteGroupResult] = []
        for position, entry in enumerate(outline):
            next_start = (
                outline[position + 1].start_ms if position + 1 < len(outline) else None
            )
            sentences = [
                sentence
                for segment in transcript.segments
                if segment.start_ms >= entry.start_ms
                and (next_start is None or segment.start_ms < next_start)
                for sentence in _sentences(segment.text)
            ]
            scored = sorted(
                ((s, len(set(_tokenize(s)))) for s in sentences),
                key=lambda pair: (-pair[1], pair[0]),
            )
            groups.append(
                NoteGroupResult(
                    chapter=entry.title,
                    bullets=[scored[0][0]] if scored else [],
                )
            )
        return groups

    # ── Action items (commitment patterns) ──────────────────────────────

    def extract_action_items(self, transcript: Transcript) -> list[ActionItemResult]:
        speakers = {segment.speaker for segment in transcript.segments}
        first_names = {name.split()[0].lower(): name for name in speakers if name.split()}

        items: list[ActionItemResult] = []
        seen: set[str] = set()
        for segment in transcript.segments:
            for sentence in _sentences(segment.text):
                if _FIRST_PERSON_RE.search(sentence):
                    # Speaker is committing themselves.
                    assignee: str | None = segment.speaker
                elif _SECOND_PERSON_RE.search(sentence):
                    # "Can you review the spec, Priya?" — a named participant
                    # wins; otherwise the delegate is genuinely unknown and
                    # None is the honest answer.
                    assignee = next(
                        (
                            first_names[word.lower()]
                            for word in re.findall(r"[A-Z][a-z]+", sentence)
                            if first_names.get(word.lower()) not in (None, segment.speaker)
                        ),
                        None,
                    )
                elif _COLLECTIVE_RE.search(sentence):
                    assignee = None
                else:
                    continue

                normalized = sentence.strip().lower()
                if normalized in seen:
                    continue
                seen.add(normalized)
                due_match = _DUE_RE.search(sentence)
                items.append(
                    ActionItemResult(
                        text=sentence.strip(),
                        assignee=assignee,
                        due_date=(
                            _resolve_due(due_match.group(0), transcript.reference_date)
                            if due_match
                            else None
                        ),
                    )
                )
        return items

    # ── Answers (term-overlap retrieval) ────────────────────────────────

    def answer_question(
        self,
        transcript: Transcript,
        question: str,
        history: Sequence[ChatTurn] = (),
    ) -> AnswerResult:
        query = set(_tokenize(question))
        # Prior user turns refine the query at half weight via inclusion —
        # enough for follow-ups like "and who owns that?" to keep context.
        for turn in history:
            if turn.role == "user":
                query |= set(_tokenize(turn.text))

        scored: list[tuple[float, int, SegmentInput]] = []
        for index, segment in enumerate(transcript.segments):
            tokens = set(_tokenize(segment.text))
            if not tokens:
                continue
            overlap = len(query & tokens)
            if overlap:
                scored.append((overlap / math.sqrt(len(tokens)), index, segment))

        top = sorted(scored, key=lambda t: (-t[0], t[1]))[:3]
        if not top:
            return AnswerResult(
                text="The transcript doesn't cover that.",
                citations=[],
            )

        top.sort(key=lambda t: t[1])
        lines = [
            f"[{_mmss(segment.start_ms)}] {segment.speaker}: “{segment.text.strip()}”"
            for _, _, segment in top
        ]
        return AnswerResult(
            text="\n".join(lines),
            citations=[
                AnswerCitation(
                    speaker=segment.speaker,
                    quote=segment.text.strip(),
                    start_ms=segment.start_ms,
                    end_ms=segment.end_ms,
                )
                for _, _, segment in top
            ],
        )
