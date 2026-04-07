import pytest

from extract_html import extract_from_html


SAMPLE = """
<html lang="en">
<head>
  <title>Test Page</title>
  <meta name="description" content="A test page.">
  <meta property="og:title" content="OG Title">
</head>
<body>
  <nav><a href="/">Home</a></nav>
  <main>
    <h1>Welcome</h1>
    <p>Main paragraph with enough words to pass length heuristics for content detection in the extraction pipeline here.</p>
  </main>
  <footer><p>Footer info</p></footer>
  <script>var x = 1;</script>
</body>
</html>
"""


def test_basic_extraction():
    r = extract_from_html(SAMPLE, ["text", "markdown", "html", "json"])
    assert r["title"] == "OG Title"
    assert r["description"] == "A test page."
    assert r["language"] == "en"
    assert "Welcome" in r["content"]["text"]
    assert "Welcome" in r["content"]["markdown"]
    assert "<" in r["content"]["html"]
    assert r["content"]["json"]["title"] == "OG Title"
    assert r["content"]["json"]["wordCount"] > 0


def test_only_main_content():
    r = extract_from_html(SAMPLE, ["text"], only_main_content=True)
    text = r["content"]["text"]
    assert "Welcome" in text
    assert "Footer info" not in text


def test_include_tags():
    r = extract_from_html(SAMPLE, ["text"], include_tags=["h1"])
    text = r["content"]["text"]
    assert "Welcome" in text


def test_exclude_tags():
    r = extract_from_html(SAMPLE, ["html"], exclude_tags=["footer", "nav"])
    html = r["content"]["html"]
    assert "Footer info" not in html
    assert "Home" not in html


def test_scripts_stripped():
    r = extract_from_html(SAMPLE, ["text"])
    assert "var x = 1" not in r["content"]["text"]


def test_empty_html():
    r = extract_from_html("", ["text", "json"])
    assert r["content"]["text"] == ""
    assert r["content"]["json"]["wordCount"] == 0


def test_no_formats_defaults():
    r = extract_from_html(SAMPLE, [])
    assert "markdown" in r["content"] or "text" in r["content"] or "json" in r["content"]


LINKS_HTML = """
<html><body>
  <a href="https://example.com/page1">Page 1</a>
  <a href="/page2">Page 2</a>
  <a href="javascript:void(0)">JS</a>
  <a href="mailto:x@y.com">Email</a>
  <img src="https://example.com/img.png" alt="Image 1">
  <img src="/photo.jpg" alt="Photo">
</body></html>
"""


def test_links_extraction():
    r = extract_from_html(LINKS_HTML, ["links"])
    links = r["content"]["links"]
    assert len(links) == 2
    assert links[0]["href"] == "https://example.com/page1"
    assert links[0]["text"] == "Page 1"
    assert links[1]["href"] == "/page2"


def test_images_extraction():
    r = extract_from_html(LINKS_HTML, ["images"])
    images = r["content"]["images"]
    assert len(images) == 2
    assert images[0]["src"] == "https://example.com/img.png"
    assert images[0]["alt"] == "Image 1"
    assert images[1]["src"] == "/photo.jpg"
