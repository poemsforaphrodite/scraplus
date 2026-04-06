"""Shared scrape orchestration (httpx, pdf, ocr heuristics) — no Modal imports."""

from __future__ import annotations

import io
import re
from typing import Any

import httpx
import pdfplumber
from bs4 import BeautifulSoup
from PIL import Image
import pytesseract

from extract_html import extract_from_html
from ssrf import assert_public_http_url

MAX_BYTES = 4 * 1024 * 1024
DEFAULT_UA = (
    "Mozilla/5.0 (compatible; Scraplus/1.0; +https://github.com/scraplus) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

def clamp_timeout(timeout: float | None) -> float:
    v = float(timeout) if timeout is not None else 15.0
    return max(3.0, min(60.0, v))


def build_headers(custom: dict[str, str] | None) -> dict[str, str]:
    h: dict[str, str] = {
        "User-Agent": DEFAULT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if custom:
        for k, v in custom.items():
            if isinstance(k, str) and isinstance(v, str):
                h[k] = v
    return h


def should_escalate_to_playwright(html: str) -> bool:
    soup = BeautifulSoup(html, "lxml")
    n_scripts = len(soup.find_all("script"))
    work = BeautifulSoup(html, "lxml")
    for tag in work(["script", "style", "noscript"]):
        tag.decompose()
    text = work.get_text(separator=" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < 80:
        return True
    if n_scripts > 12 and len(text) < 400:
        return True
    return False


def httpx_fetch(
    url: str, timeout: float, headers: dict[str, str] | None
) -> tuple[str, int, str | None, bytes, str]:
    url = assert_public_http_url(url)
    t = httpx.Timeout(timeout + 2.0, connect=min(10.0, timeout))
    with httpx.Client(timeout=t, follow_redirects=True) as client:
        r = client.get(url, headers=build_headers(headers))
        ct = r.headers.get("content-type")
        cl = r.headers.get("content-length")
        if cl:
            try:
                n = int(cl)
                if n > MAX_BYTES:
                    raise ValueError("Response too large")
            except ValueError:
                pass
        buf = r.content
        if len(buf) > MAX_BYTES:
            raise ValueError("Response too large")
        enc = r.encoding or "utf-8"
        text = buf.decode(enc, errors="replace")
        return str(r.url), r.status_code, ct, buf, text


def scrape_pdf(
    url: str,
    timeout: float,
    headers: dict[str, str] | None,
    formats: list[str],
) -> dict[str, Any]:
    final_url, status_code, content_type, buf, _t = httpx_fetch(url, timeout, headers)
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(buf)) as pdf:
        for page in pdf.pages:
            pt = page.extract_text()
            if pt:
                text_parts.append(pt)
    full_text = "\n\n".join(text_parts).strip()
    content = formats_payload(formats, full_text, None, None, None, None)
    return _ok_response(
        final_url,
        status_code,
        content_type or "application/pdf",
        content,
        title=None,
        description=None,
        language=None,
        engine="httpx",
        engine_note="pdfplumber",
    )


def scrape_ocr(
    url: str,
    timeout: float,
    headers: dict[str, str] | None,
    formats: list[str],
) -> dict[str, Any]:
    final_url, status_code, content_type, buf, _t = httpx_fetch(url, timeout, headers)
    img = Image.open(io.BytesIO(buf))
    ocr_text = pytesseract.image_to_string(img).strip()
    content = formats_payload(formats, ocr_text, None, None, None, None)
    return _ok_response(
        final_url,
        status_code,
        content_type,
        content,
        title=None,
        description=None,
        language=None,
        engine="httpx",
        engine_note="pytesseract",
    )


def formats_payload(
    requested_formats: list[str],
    full_text: str,
    title: str | None,
    description: str | None,
    language: str | None,
    word_count_extra: int | None,
) -> dict[str, Any]:
    fmt = {f.lower().strip() for f in requested_formats}
    content: dict[str, Any] = {}
    if "text" in fmt:
        content["text"] = full_text
    if "markdown" in fmt:
        content["markdown"] = full_text
    if "html" in fmt:
        content["html"] = f"<pre>{_esc_html(full_text)}</pre>"
    if "json" in fmt:
        words = full_text.split() if full_text else []
        content["json"] = {
            "title": title,
            "description": description,
            "language": language,
            "wordCount": word_count_extra if word_count_extra is not None else len(words),
        }
    return content


def _esc_html(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _ok_response(
    final_url: str,
    status_code: int,
    content_type: str | None,
    content: dict[str, Any],
    *,
    title: str | None,
    description: str | None,
    language: str | None,
    engine: str,
    engine_note: str | None = None,
    escalated: bool = False,
    screenshot_b64: str | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "url": final_url,
        "status_code": status_code,
        "content": content,
        "title": title,
        "metadata": {
            "description": description,
            "language": language,
            "content_type": content_type,
        },
        "engine": {
            "name": engine,
            "version": "1.0.0",
            "note": engine_note or "",
            "escalated": escalated,
        },
    }
    if screenshot_b64:
        out["screenshot_base64"] = screenshot_b64
    return out


def scrape_http_html(
    url: str,
    formats: list[str],
    timeout: float,
    headers: dict[str, str] | None,
) -> tuple[dict[str, Any], str]:
    """Returns (response dict, raw html string)."""
    final_url, status_code, content_type, _buf, html = httpx_fetch(
        url, timeout, headers
    )
    extracted = extract_from_html(html, formats)
    content = extracted["content"]
    resp = _ok_response(
        final_url,
        status_code,
        content_type,
        content,
        title=extracted["title"],
        description=extracted["description"],
        language=extracted["language"],
        engine="httpx",
        engine_note=None,
        escalated=False,
    )
    return resp, html


def build_response_from_html(
    html: str,
    formats: list[str],
    final_url: str,
    status_code: int,
    content_type: str | None,
    *,
    engine: str,
    escalated: bool,
    screenshot_b64: str | None = None,
) -> dict[str, Any]:
    extracted = extract_from_html(html, formats)
    return _ok_response(
        final_url,
        status_code,
        content_type,
        extracted["content"],
        title=extracted["title"],
        description=extracted["description"],
        language=extracted["language"],
        engine=engine,
        escalated=escalated,
        screenshot_b64=screenshot_b64,
    )
