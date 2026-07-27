"""The search query syntax (T-35.3)."""

from __future__ import annotations

from datetime import date

from app.services.search_query import parse_query


class TestParsing:
    def test_bare_words_are_included(self) -> None:
        parsed = parse_query("pricing roadmap")
        assert [t.text for t in parsed.include] == ["pricing", "roadmap"]
        assert parsed.exclude == []

    def test_a_quoted_phrase_stays_one_term(self) -> None:
        parsed = parse_query('"pricing model" rollout')
        assert [(t.text, t.is_phrase) for t in parsed.include] == [
            ("pricing model", True),
            ("rollout", False),
        ]

    def test_an_unclosed_quote_is_closed_at_the_end(self) -> None:
        # A search box is not a compiler; the intent is obvious.
        parsed = parse_query('"pricing model')
        assert [t.text for t in parsed.include] == ["pricing model"]

    def test_a_minus_excludes(self) -> None:
        parsed = parse_query("pricing -churn")
        assert [t.text for t in parsed.include] == ["pricing"]
        assert [t.text for t in parsed.exclude] == ["churn"]

    def test_a_negated_phrase_excludes_the_phrase(self) -> None:
        parsed = parse_query('pricing -"rate limit"')
        assert [t.text for t in parsed.exclude] == ["rate limit"]

    def test_speaker_filter_is_lifted_out_of_the_text(self) -> None:
        parsed = parse_query("speaker:Sarah pricing")
        assert parsed.speaker == "Sarah"
        assert [t.text for t in parsed.include] == ["pricing"]

    def test_quoted_speaker_names_carry_spaces(self) -> None:
        parsed = parse_query('speaker:"Sarah Chen" pricing')
        assert parsed.speaker == "Sarah Chen"

    def test_date_filters_parse(self) -> None:
        parsed = parse_query("pricing before:2026-08-01 after:2026-07-01")
        assert parsed.before == date(2026, 8, 1)
        assert parsed.after == date(2026, 7, 1)
        assert [t.text for t in parsed.include] == ["pricing"]

    def test_a_malformed_date_is_just_a_word(self) -> None:
        # `after:lunch` is a phrase somebody actually said.
        parsed = parse_query("after:lunch")
        assert parsed.after is None
        assert [t.text for t in parsed.include] == ["after:lunch"]

    def test_an_unknown_field_is_searched_literally(self) -> None:
        # People search for `re: budget` and mean it.
        parsed = parse_query("re:budget")
        assert [t.text for t in parsed.include] == ["re:budget"]


class TestFtsExpression:
    def test_terms_are_quoted_and_the_last_word_prefixed(self) -> None:
        assert parse_query("pricing road").to_fts() == '"pricing" "road"*'

    def test_a_phrase_is_never_prefixed(self) -> None:
        # `"pricing model"*` is valid FTS but surprising mid-phrase; only a
        # trailing bare word benefits from narrowing-as-you-type.
        assert parse_query('"pricing model"').to_fts() == '"pricing model"'

    def test_exclusions_chain_with_not(self) -> None:
        assert parse_query("pricing -churn -billing").to_fts() == (
            '(("pricing"*) NOT "churn") NOT "billing"'
        )

    def test_punctuation_cannot_reach_fts_as_syntax(self) -> None:
        # `a.*b` is characters. The tokeniser splits on the dot and star, and
        # everything that survives is inside quotes.
        expression = parse_query("a.*b").to_fts()
        assert "*b" not in expression.replace('"', "")
        assert expression  # something searchable survived

    def test_only_filters_yields_no_text_match(self) -> None:
        parsed = parse_query("speaker:Sarah")
        assert not parsed.has_text
        assert parsed.to_fts() == ""

    def test_only_exclusions_yields_no_match(self) -> None:
        # There is nothing to subtract FROM.
        assert parse_query("-churn").to_fts() == ""
