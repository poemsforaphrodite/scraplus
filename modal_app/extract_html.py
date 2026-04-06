"""Extract text / html / markdown / json from HTML (BeautifulSoup + markdownify)."""

from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup
from markdownify import markdownify as html_to_md

ALLOWED_FORMATS = frozenset({"html", "text", "markdown", "json"})


def extract_from_html(html: str, formats: list[str]) -> dict[str, Any]:
    fmt = {f.lower().strip() for f in formats if isinstance(f, str)}
    fmt &= ALLOWED_FORMATS
    if not fmt:
        fmt = {"markdown", "text", "json"}

    soup = BeautifulSoup(html, "lxml")

    title = None
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        title = og["content"].strip()
    if not title and soup.title and soup.title.string:
        title = soup.title.string.strip()

    description = None
    m = soup.find("meta", attrs={"name": "description"})
    if m and m.get("content"):
        description = m["content"].strip()
    if not description:
        ogd = soup.find("meta", property="og:description")
        if ogd and ogd.get("content"):
            description = ogd["content"].strip()

    language = None
    html_el = soup.find("html")
    if html_el and html_el.get("lang"):
        language = html_el["lang"].strip()
    if not language:
        cl = soup.find("meta", attrs={"http-equiv": re.compile("content-language", re.I)})
        if cl and cl.get("content"):
            language = cl["content"].strip()

    work = BeautifulSoup(str(soup), "lxml")
    for tag in work(["script", "style", "noscript", "iframe"]):
        tag.decompose()

    body = work.find("body")
    body_html = ""
    if body:
        body_html = body.decode_contents() if body else ""
    if not body_html:
        body_html = work.decode_contents()

    text = ""
    if "text" in fmt or "json" in fmt:
        raw = body.get_text(separator=" ", strip=True) if body else work.get_text(
            separator=" ", strip=True
        )
        text = re.sub(r"\s+", " ", raw).strip()

    content: dict[str, Any] = {}

    if "html" in fmt:
        content["html"] = body_html or html

    if "text" in fmt:
        content["text"] = text

    if "markdown" in fmt:
        content["markdown"] = html_to_md(body_html or html, heading_style="ATX")

    if "json" in fmt:
        words = text.split() if text else []
        content["json"] = {
            "title": title,
            "description": description,
            "language": language,
            "wordCount": len(words),
        }

    return {
        "title": title,
        "description": description,
        "language": language,
        "content": content,
    }
