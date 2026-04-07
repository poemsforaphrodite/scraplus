import pytest

from llm_extract import truncate_html, MAX_HTML_CHARS


def test_truncate_short_html():
    html = "<h1>Hello</h1>"
    assert truncate_html(html) == "<h1>Hello</h1>"


def test_truncate_long_html():
    html = "x " * (MAX_HTML_CHARS + 100)
    result = truncate_html(html)
    assert len(result) <= MAX_HTML_CHARS
    assert result.endswith("[truncated]")


def test_truncate_collapses_whitespace():
    html = "hello   \n\n   world"
    assert truncate_html(html) == "hello world"


def test_llm_extract_requires_api_key(monkeypatch):
    monkeypatch.delenv("SCRAPLUS_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    from llm_extract import llm_extract_sync

    with pytest.raises(ValueError, match="requires"):
        llm_extract_sync(html="<p>test</p>", prompt="extract", schema=None, urls=None)
