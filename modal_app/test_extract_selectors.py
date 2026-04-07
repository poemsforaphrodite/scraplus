import pytest

from extract_selectors import extract_with_selectors


HTML = """
<html>
<head><title>Test</title></head>
<body>
  <h1>Main Heading</h1>
  <p class="intro">First paragraph.</p>
  <p class="details">Second paragraph.</p>
  <ul>
    <li class="item">Item 1</li>
    <li class="item">Item 2</li>
    <li class="item">Item 3</li>
  </ul>
  <footer>Footer text</footer>
</body>
</html>
"""


def test_single_selector():
    data = extract_with_selectors(HTML, {"heading": "h1"})
    assert data["heading"] == "Main Heading"


def test_multiple_selectors():
    data = extract_with_selectors(HTML, {"heading": "h1", "intro": "p.intro"})
    assert data["heading"] == "Main Heading"
    assert data["intro"] == "First paragraph."


def test_missing_element_returns_none():
    data = extract_with_selectors(HTML, {"missing": "div.nonexistent"})
    assert data["missing"] is None


def test_empty_selector_returns_none():
    data = extract_with_selectors(HTML, {"empty": ""})
    assert data["empty"] is None


def test_array_fields():
    data = extract_with_selectors(
        HTML, {"items": "li.item"}, array_fields={"items"}
    )
    assert data["items"] == ["Item 1", "Item 2", "Item 3"]


def test_empty_html():
    data = extract_with_selectors("", {"heading": "h1"})
    assert data["heading"] is None
