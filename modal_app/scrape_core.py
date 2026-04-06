"""Shared scrape orchestration (httpx, pdf, ocr heuristics) — no Modal imports."""

from __future__ import annotations

import io
import os
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


def merge_scrape_options(body: dict[str, Any]) -> dict[str, Any]:
    """Merge nested `scrape_options` into the body (top-level keys win)."""
    base = dict(body)
    so = base.pop("scrape_options", None)
    if isinstance(so, dict):
        return {**so, **base}
    return base


def extract_options_from_body(body: dict[str, Any] | None) -> dict[str, Any]:
    if not body:
        return {}
    inc = body.get("include_tags")
    exc = body.get("exclude_tags")
    return {
        "only_main_content": bool(body.get("only_main_content")),
        "include_tags": inc if isinstance(inc, list) else None,
        "exclude_tags": exc if isinstance(exc, list) else None,
    }


def httpx_proxy_url(body: dict[str, Any] | None) -> str | None:
    if not body:
        return os.environ.get("SCRAPLUS_HTTP_PROXY") or None
    p = body.get("proxy") or body.get("proxy_url")
    if isinstance(p, str) and p.strip():
        return p.strip()
    return os.environ.get("SCRAPLUS_HTTP_PROXY") or None


def httpx_verify(body: dict[str, Any] | None) -> bool:
    if not body:
        return True
    if body.get("skip_tls_verification") is True:
        return False
    if body.get("verify_ssl") is False:
        return False
    return True


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
    url: str,
    timeout: float,
    headers: dict[str, str] | None,
    *,
    verify: bool = True,
    proxy_url: str | None = None,
) -> tuple[str, int, str | None, bytes, str]:
    url = assert_public_http_url(url)
    t = httpx.Timeout(timeout + 2.0, connect=min(10.0, timeout))
    with httpx.Client(
        timeout=t,
        follow_redirects=True,
        verify=verify,
        proxy=proxy_url,
    ) as client:
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
    *,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    verify = httpx_verify(body)
    proxy = httpx_proxy_url(body)
    final_url, status_code, content_type, buf, _t = httpx_fetch(
        url, timeout, headers, verify=verify, proxy_url=proxy
    )
    mode = (body or {}).get("pdf_mode", "text").lower()
    if mode == "markdown":
        text_parts: list[str] = []
        with pdfplumber.open(io.BytesIO(buf)) as pdf:
            for page in pdf.pages:
                pt = page.extract_text()
                if pt:
                    text_parts.append(pt.strip())
        full_text = "\n\n".join(text_parts).strip()
        content = formats_payload(formats, full_text, None, None, None, None)
    else:
        text_parts = []
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
    *,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    verify = httpx_verify(body)
    proxy = httpx_proxy_url(body)
    final_url, status_code, content_type, buf, _t = httpx_fetch(
        url, timeout, headers, verify=verify, proxy_url=proxy
    )
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
    body: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], str]:
    """Returns (response dict, raw html string)."""
    verify = httpx_verify(body)
    proxy = httpx_proxy_url(body)
    xopts = extract_options_from_body(body)
    max_age_ms = None
    min_age_ms = None
    if body:
        if body.get("max_age_ms") is not None:
            max_age_ms = int(body["max_age_ms"])
        if body.get("min_age_ms") is not None:
            min_age_ms = int(body["min_age_ms"])

    final_url, status_code, content_type, _buf, html = httpx_fetch(
        url, timeout, headers, verify=verify, proxy_url=proxy
    )
    extracted = extract_from_html(html, formats, **xopts)
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
    # stash cache hints for caller (Modal app)
    if max_age_ms is not None:
        resp["_cache_max_age_ms"] = max_age_ms
    if min_age_ms is not None:
        resp["_cache_min_age_ms"] = min_age_ms
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
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    xopts = extract_options_from_body(body)
    extracted = extract_from_html(html, formats, **xopts)
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
