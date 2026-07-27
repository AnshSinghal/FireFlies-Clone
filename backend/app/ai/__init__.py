"""Pluggable AI provider layer (T-29).

Everything callers need is re-exported here; `app.ai.*` submodules are an
implementation detail of this package.
"""

from app.ai.cache import GenerationLimitExceeded
from app.ai.factory import (
    FALLBACK_PROVIDER_LABEL,
    AIProviderDep,
    build_provider,
    generation_counter,
    get_ai_provider,
)
from app.ai.llm import LLMProvider
from app.ai.mock import MockProvider
from app.ai.provider import AIProvider, ProviderError
from app.ai.types import (
    ActionItemResult,
    AnswerResult,
    ChatTurn,
    KeywordResult,
    NoteGroupResult,
    OutlineEntryResult,
    SegmentInput,
    SummaryResult,
    Transcript,
)

__all__ = [
    "FALLBACK_PROVIDER_LABEL",
    "AIProvider",
    "AIProviderDep",
    "ActionItemResult",
    "AnswerResult",
    "ChatTurn",
    "GenerationLimitExceeded",
    "KeywordResult",
    "LLMProvider",
    "MockProvider",
    "NoteGroupResult",
    "OutlineEntryResult",
    "ProviderError",
    "SegmentInput",
    "SummaryResult",
    "Transcript",
    "build_provider",
    "generation_counter",
    "get_ai_provider",
]
