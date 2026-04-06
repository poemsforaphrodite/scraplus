"""Playwright-based scrape (runs in browser Modal image only)."""

from __future__ import annotations

import base64
from typing import Any

from playwright.sync_api import sync_playwright

from scrape_core import build_headers, build_response_from_html, clamp_timeout
from ssrf import assert_public_http_url


def scrape_with_playwright(body: dict[str, Any]) -> dict[str, Any]:
    url = body["url"]
    assert_public_http_url(url)
    timeout = clamp_timeout(body.get("timeout"))
    hdrs = build_headers(body.get("headers"))
    formats = body.get("formats") or ["markdown", "text", "json"]
    wait_for = body.get("wait_for")
    want_shot = bool(body.get("screenshot"))

    timeout_ms = int(timeout * 1000)
    ua = hdrs.get("User-Agent")
    extra = {k: v for k, v in hdrs.items() if k.lower() != "user-agent"}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            ctx = browser.new_context(
                user_agent=ua,
                extra_http_headers=extra,
            )
            page = ctx.new_page()
            page.set_default_timeout(timeout_ms)
            resp = page.goto(
                url, wait_until="domcontentloaded", timeout=timeout_ms
            )
            status_code = int(resp.status) if resp else 200
            if wait_for:
                page.wait_for_selector(str(wait_for), timeout=timeout_ms)
            html = page.content()
            final_url = page.url
            screenshot_b64: str | None = None
            if want_shot:
                screenshot_b64 = base64.b64encode(
                    page.screenshot(type="png", full_page=False)
                ).decode("ascii")
        finally:
            browser.close()

    return build_response_from_html(
        html,
        formats,
        final_url,
        status_code,
        "text/html",
        engine="playwright",
        escalated=False,
        screenshot_b64=screenshot_b64,
    )
