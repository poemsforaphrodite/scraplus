"""Extract text / html / markdown / json from HTML (BeautifulSoup + markdownify)."""

from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup, Tag
from markdownify import markdownify as html_to_md

ALLOWED_FORMATS = frozenset({"html", "text", "markdown", "json", "links", "images"})


def _pick_main_root(soup: BeautifulSoup) -> Tag | None:
    for sel in (
        soup.find("main"),
        soup.find("article"),
        soup.find(attrs={"role": "main"}),
    ):
        if isinstance(sel, Tag):
            return sel
    candidates = soup.find_all(["article", "div", "section"], limit=40)
    best: Tag | None = None
    best_len = 0
    for el in candidates:
        if not isinstance(el, Tag):
            continue
        if el.find_parent(["nav", "header", "footer", "aside"]):
            continue
        t = el.get_text(separator=" ", strip=True)
        n = len(re.sub(r"\s+", " ", t))
        if n > best_len and n > 200:
            best_len = n
            best = el
    return best


def extract_from_html(
    html: str,
    formats: list[str],
    *,
    only_main_content: bool = False,
    include_tags: list[str] | None = None,
    exclude_tags: list[str] | None = None,
) -> dict[str, Any]:
    fmt = {f.lower().strip() for f in formats if isinstance(f, str)}
    fmt &= ALLOWED_FORMATS
    if not fmt:
        fmt = {"markdown", "text", "json"}

    soup_meta = BeautifulSoup(html, "lxml")

    title = None
    og = soup_meta.find("meta", property="og:title")
    if og and og.get("content"):
        title = og["content"].strip()
    if not title and soup_meta.title and soup_meta.title.string:
        title = soup_meta.title.string.strip()

    description = None
    m = soup_meta.find("meta", attrs={"name": "description"})
    if m and m.get("content"):
        description = m["content"].strip()
    if not description:
        ogd = soup_meta.find("meta", property="og:description")
        if ogd and ogd.get("content"):
            description = ogd["content"].strip()

    language = None
    html_el = soup_meta.find("html")
    if html_el and html_el.get("lang"):
        language = html_el["lang"].strip()
    if not language:
        cl = soup_meta.find("meta", attrs={"http-equiv": re.compile("content-language", re.I)})
        if cl and cl.get("content"):
            language = cl["content"].strip()

    work = BeautifulSoup(html, "lxml")
    extra_exclude = {t.lower() for t in (exclude_tags or []) if isinstance(t, str)}
    for tag in work(list({"script", "style", "noscript", "iframe"} | extra_exclude)):
        tag.decompose()

    content_root: Tag | BeautifulSoup = work
    if only_main_content:
        main_el = _pick_main_root(work)
        if main_el is not None:
            content_root = main_el
    elif include_tags:
        itags = [t.lower() for t in include_tags if isinstance(t, str)]
        if itags:
            frag = BeautifulSoup("", "lxml")
            container = frag.new_tag("div")
            for name in itags:
                for el in work.find_all(name):
                    container.append(el.extract())
            frag.append(container)
            content_root = container

    body_html = ""
    if isinstance(content_root, Tag):
        body_html = content_root.decode_contents()
    else:
        b = content_root.find("body")
        body_html = b.decode_contents() if b else content_root.decode_contents()

    text = ""
    if "text" in fmt or "json" in fmt:
        raw = content_root.get_text(separator=" ", strip=True)
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

    if "links" in fmt:
        links: list[dict[str, str]] = []
        link_soup = BeautifulSoup(html, "lxml")
        for a in link_soup.find_all("a", href=True):
            href = str(a["href"]).strip()
            if href and not href.startswith(("#", "javascript:", "mailto:")):
                links.append({
                    "href": href,
                    "text": a.get_text(strip=True) or "",
                })
        content["links"] = links

    if "images" in fmt:
        images: list[dict[str, str]] = []
        img_soup = BeautifulSoup(html, "lxml")
        for img in img_soup.find_all("img", src=True):
            src = str(img["src"]).strip()
            if src:
                images.append({
                    "src": src,
                    "alt": str(img.get("alt", "")).strip(),
                })
        content["images"] = images

    return {
        "title": title,
        "description": description,
        "language": language,
        "content": content,
    }
