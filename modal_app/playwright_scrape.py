"""Playwright-based scrape (runs in browser Modal image only)."""

from __future__ import annotations

import base64
import time
from typing import Any

from playwright.sync_api import sync_playwright

from scrape_core import build_headers, build_response_from_html, clamp_timeout
from ssrf import assert_public_http_url

MOBILE_VIEWPORT = {"width": 390, "height": 844}
MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


def scrape_with_playwright(body: dict[str, Any]) -> dict[str, Any]:
    url = body["url"]
    assert_public_http_url(url)
    timeout = clamp_timeout(body.get("timeout"))
    hdrs = build_headers(body.get("headers"))
    formats = body.get("formats") or ["markdown", "text", "json"]
    wait_for = body.get("wait_for")
    want_shot = bool(body.get("screenshot"))
    wait_ms = int(body.get("wait_ms") or 0)
    mobile = bool(body.get("mobile"))
    proxy_url = body.get("proxy") or body.get("proxy_url")
    if isinstance(proxy_url, str) and not proxy_url.strip():
        proxy_url = None

    timeout_ms = int(timeout * 1000)
    ua = hdrs.get("User-Agent")
    if mobile:
        ua = MOBILE_UA
    extra = {k: v for k, v in hdrs.items() if k.lower() != "user-agent"}

    proxy_cfg: dict[str, str] | None = None
    if isinstance(proxy_url, str) and proxy_url.strip():
        proxy_cfg = {"server": proxy_url.strip()}

    launch_kw: dict[str, object] = {"headless": True}
    if proxy_cfg:
        launch_kw["proxy"] = proxy_cfg

    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_kw)
        try:
            ctx_kwargs: dict[str, Any] = {
                "user_agent": ua,
                "extra_http_headers": extra,
            }
            if mobile:
                ctx_kwargs["viewport"] = MOBILE_VIEWPORT
                ctx_kwargs["is_mobile"] = True
                ctx_kwargs["user_agent"] = MOBILE_UA
            ctx = browser.new_context(**ctx_kwargs)
            page = ctx.new_page()
            page.set_default_timeout(timeout_ms)
            resp = page.goto(
                url, wait_until="domcontentloaded", timeout=timeout_ms
            )
            status_code = int(resp.status) if resp else 200
            if wait_for:
                page.wait_for_selector(str(wait_for), timeout=timeout_ms)
            if wait_ms > 0:
                time.sleep(min(wait_ms / 1000.0, 30.0))
            html = page.content()
            final_url = page.url
            screenshot_b64: str | None = None
            if want_shot:
                shot_cfg = body.get("screenshot") if isinstance(body.get("screenshot"), dict) else {}
                full_page = bool(shot_cfg.get("fullPage", False)) if isinstance(shot_cfg, dict) else False
                quality = None
                if isinstance(shot_cfg, dict) and "quality" in shot_cfg:
                    quality = max(0, min(100, int(shot_cfg["quality"])))
                vp = shot_cfg.get("viewport") if isinstance(shot_cfg, dict) else None
                if isinstance(vp, dict) and "width" in vp and "height" in vp:
                    page.set_viewport_size({"width": int(vp["width"]), "height": int(vp["height"])})
                shot_type = "jpeg" if quality is not None else "png"
                shot_args: dict[str, Any] = {"type": shot_type, "full_page": full_page}
                if quality is not None:
                    shot_args["quality"] = quality
                screenshot_b64 = base64.b64encode(
                    page.screenshot(**shot_args)
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
        body=body,
    )
