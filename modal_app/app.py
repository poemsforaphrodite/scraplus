"""Scraplus Modal app — deploy: `modal deploy modal_app/app.py` from repo root."""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

import modal
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from jsonschema import validate as jsonschema_validate
from jsonschema.exceptions import ValidationError

# playwright_scrape imports playwright — only installed on browser_image. Lazy-import inside
# scrape_playwright_fn so light_image workers (API, batch, job) can load app.py.
from cache_lib import CACHE_DICT_NAME, cache_get, cache_key, cache_put
from crawl_lib import (
    CrawlRules,
    apply_delay,
    can_fetch_url_robots,
    extract_links_from_html,
    fetch_robots_txt,
    fetch_sitemap_urls,
    normalize_url,
    seed_parts,
    url_matches_rules,
)
from extract_selectors import extract_with_selectors
from llm_extract import llm_extract_sync
from map_lib import discover_urls
from schedule_lib import cron_matches, next_run_after, parse_cron, validate_schedule
from scrape_core import (
    clamp_timeout,
    merge_scrape_options,
    scrape_http_html,
    scrape_ocr,
    scrape_pdf,
    should_escalate_to_playwright,
)
from ssrf import SsrfError, assert_public_http_url
from webhook_util import deliver_with_retries

logger = logging.getLogger(__name__)

APP_NAME = "scraplus"
JOB_TTL_SEC = 600
CRAWL_TTL_SEC = 7200
CRAWL_STEP_URLS = 12
JOBS_DICT = "scraplus-jobs-v1"
BATCH_DICT = "scraplus-batches-v1"
CRAWL_DICT = "scraplus-crawls-v1"
EXTRACT_JOBS_DICT = "scraplus-extract-jobs-v1"
SCHEDULES_DICT = "scraplus-schedules-v1"
SCHEDULE_RUNS_DICT = "scraplus-schedule-runs-v1"
MONITORS_DICT = "scraplus-monitors-v1"
MONITOR_SNAPSHOTS_DICT = "scraplus-monitor-snapshots-v1"
API_KEYS_DICT = "scraplus-api-keys-v1"
USAGE_DICT = "scraplus-usage-v1"

_SCRAPLUS_DIR = Path(__file__).resolve().parent
_REQ_FILE = "modal_app/requirements-light.txt"
_SOURCE_IGNORE = ["test_*.py", "**/.pytest_cache/**"]

light_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements(_REQ_FILE)
    .add_local_dir(_SCRAPLUS_DIR, remote_path="/root", ignore=_SOURCE_IGNORE)
)

browser_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements(_REQ_FILE)
    .pip_install("playwright")
    .run_commands(
        "playwright install-deps chromium",
        "playwright install chromium",
    )
    .add_local_dir(_SCRAPLUS_DIR, remote_path="/root", ignore=_SOURCE_IGNORE)
)

proxy_secret = modal.Secret.from_name(
    "scraplus-proxy-secret",
    required_keys=["SCRAPLUS_PROXY_SECRET"],
)

app = modal.App(APP_NAME)


def verify_proxy_secret(request: Request) -> None:
    expected = os.environ.get("SCRAPLUS_PROXY_SECRET", "")
    if not expected:
        raise HTTPException(status_code=500, detail="Missing SCRAPLUS_PROXY_SECRET")
    got = request.headers.get("X-Scraplus-Secret", "")
    if got != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def jobs_dict() -> modal.Dict:
    return modal.Dict.from_name(JOBS_DICT, create_if_missing=True)


def batches_dict() -> modal.Dict:
    return modal.Dict.from_name(BATCH_DICT, create_if_missing=True)


def crawls_dict() -> modal.Dict:
    return modal.Dict.from_name(CRAWL_DICT, create_if_missing=True)


def extract_jobs_dict() -> modal.Dict:
    return modal.Dict.from_name(EXTRACT_JOBS_DICT, create_if_missing=True)


def schedules_dict() -> modal.Dict:
    return modal.Dict.from_name(SCHEDULES_DICT, create_if_missing=True)


def schedule_runs_dict() -> modal.Dict:
    return modal.Dict.from_name(SCHEDULE_RUNS_DICT, create_if_missing=True)


def monitors_dict() -> modal.Dict:
    return modal.Dict.from_name(MONITORS_DICT, create_if_missing=True)


def monitor_snapshots_dict() -> modal.Dict:
    return modal.Dict.from_name(MONITOR_SNAPSHOTS_DICT, create_if_missing=True)


def api_keys_dict() -> modal.Dict:
    return modal.Dict.from_name(API_KEYS_DICT, create_if_missing=True)


def usage_dict() -> modal.Dict:
    return modal.Dict.from_name(USAGE_DICT, create_if_missing=True)


def http_cache_dict() -> modal.Dict:
    return modal.Dict.from_name(CACHE_DICT_NAME, create_if_missing=True)


def touch_ttl(data: dict[str, Any] | None, ttl: float = JOB_TTL_SEC) -> dict[str, Any] | None:
    if not data:
        return None
    created = float(data.get("created_at", 0))
    if time.time() - created > ttl:
        return None
    return data


class WebhookConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str
    secret: str = ""
    events: list[str] | None = None
    metadata: dict[str, Any] | None = None


class CrawlRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str
    limit: int | None = 100
    max_discovery_depth: int | None = None
    include_paths: list[str] | None = None
    exclude_paths: list[str] | None = None
    regex_on_full_url: bool = False
    crawl_entire_domain: bool = False
    allow_subdomains: bool = False
    allow_external_links: bool = False
    sitemap: str = "include"
    ignore_query_parameters: bool = False
    delay_sec: float = 0
    max_concurrency: int = 1
    robots_policy: str = "ignore"
    scrape_options: dict[str, Any] | None = None
    webhook: WebhookConfig | None = None


class ScrapeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str
    mode: str = "auto"
    formats: list[str] | None = None
    timeout: float | None = None
    headers: dict[str, str] | None = None
    wait_for: str | None = None
    screenshot: bool = False
    async_job: bool = Field(default=False, alias="async")
    only_main_content: bool = False
    include_tags: list[str] | None = None
    exclude_tags: list[str] | None = None
    wait_ms: int | None = None
    mobile: bool = False
    skip_tls_verification: bool = False
    verify_ssl: bool | None = None
    proxy: str | None = None
    max_age_ms: int | None = None
    min_age_ms: int | None = None
    pdf_mode: str | None = None
    scrape_options: dict[str, Any] | None = None


class BatchRequest(BaseModel):
    urls: list[str]
    mode: str = "auto"
    formats: list[str] | None = None
    timeout: float | None = None
    headers: dict[str, str] | None = None
    scrape_options: dict[str, Any] | None = None
    webhook: WebhookConfig | None = None


class SelectorExtractRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str
    selectors: dict[str, str]
    schema: dict[str, Any] | None = None
    mode: str = "auto"
    timeout: float | None = None
    headers: dict[str, str] | None = None
    scrape_options: dict[str, Any] | None = None


class LLMExtractRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    urls: list[str] | None = None
    url: str | None = None
    prompt: str
    schema: dict[str, Any] | None = None
    mode: str = "auto"
    timeout: float | None = None
    headers: dict[str, str] | None = None
    async_job: bool = Field(default=False, alias="async")


class MapRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str
    limit: int = 5000
    ignore_sitemap: bool = Field(default=False, alias="ignoreSitemap")
    include_subdomains: bool = Field(default=True, alias="includeSubdomains")
    search: str | None = None
    timeout: float | None = None


class SearchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    query: str
    limit: int = 5
    lang: str | None = None
    location: str | None = None
    scrape_options: dict[str, Any] | None = Field(default=None, alias="scrapeOptions")
    timeout: float | None = None


class InteractAction(BaseModel):
    type: str  # click, type, scroll, wait, screenshot
    selector: str | None = None
    text: str | None = None
    value: int | None = None


class InteractRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str
    actions: list[InteractAction]
    timeout: float | None = None
    formats: list[str] | None = None
    headers: dict[str, str] | None = None


@app.function(
    image=browser_image,
    secrets=[proxy_secret],
    timeout=120,
    cpu=1.0,
    memory=2048,
)
def scrape_playwright_fn(body: dict) -> dict:
    from playwright_scrape import scrape_with_playwright

    return scrape_with_playwright(body)


def scrape_body_from_scrape_request(req: ScrapeRequest) -> dict[str, Any]:
    d = req.model_dump(exclude_none=True, by_alias=False)
    d.pop("async_job", None)
    return merge_scrape_options(d)


def _cache_parts_for_body(body: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": body.get("mode"),
        "formats": tuple(body.get("formats") or ()),
        "only_main_content": body.get("only_main_content"),
        "proxy": body.get("proxy"),
    }


def perform_scrape(body: dict[str, Any]) -> dict[str, Any]:
    """Orchestrates httpx + optional Playwright (remote)."""
    body = merge_scrape_options(body)
    mode = (body.get("mode") or "auto").lower().strip()
    url = body["url"]
    assert_public_http_url(url)
    timeout = clamp_timeout(body.get("timeout"))
    headers = body.get("headers")
    formats = body.get("formats") or ["markdown", "text", "json"]

    max_age_ms = body.get("max_age_ms")
    min_age_ms = body.get("min_age_ms")
    if max_age_ms is not None:
        max_age_ms = int(max_age_ms)
    if min_age_ms is not None:
        min_age_ms = int(min_age_ms)

    if max_age_ms is not None or min_age_ms is not None:
        ck = cache_key(url, _cache_parts_for_body({**body, "mode": mode}))
        cd = http_cache_dict()

        def getter(k: str) -> dict[str, Any]:
            return dict(cd[k])

        cached = cache_get(
            getter,
            ck,
            max_age_ms=max_age_ms,
            min_age_ms=min_age_ms,
        )
        if cached is not None:
            return cached
        if min_age_ms is not None:
            raise ValueError("SCRAPE_NO_CACHED_DATA")

    if mode == "pdf":
        result = scrape_pdf(url, timeout, headers, formats, body=body)
    elif mode == "ocr":
        result = scrape_ocr(url, timeout, headers, formats, body=body)
    elif mode == "js":
        result = scrape_playwright_fn.remote({**body, "url": url, "timeout": timeout})
    elif mode == "html":
        res, _h = scrape_http_html(url, formats, timeout, headers, body)
        result = {k: v for k, v in res.items() if not str(k).startswith("_cache_")}
    else:
        res, html = scrape_http_html(url, formats, timeout, headers, body)
        res = {k: v for k, v in res.items() if not str(k).startswith("_cache_")}
        if not should_escalate_to_playwright(html):
            result = res
        else:
            out = scrape_playwright_fn.remote({**body, "url": url, "timeout": timeout})
            if isinstance(out, dict) and "engine" in out:
                out["engine"] = {**out["engine"], "escalated": True}
            result = out

    result = {k: v for k, v in result.items() if not str(k).startswith("_cache_")}

    if max_age_ms is not None and mode in ("auto", "html", "js"):
        ck = cache_key(url, _cache_parts_for_body({**body, "mode": mode}))
        cd_cache = http_cache_dict()
        cache_put(lambda k, v: cd_cache.__setitem__(k, v), ck, result)

    return result


@app.function(
    image=light_image,
    secrets=[proxy_secret],
    timeout=120,
    cpu=1.0,
    memory=1024,
)
def scrape_job_worker(job_id: str, payload_json: str) -> None:
    jd = jobs_dict()
    payload: dict = json.loads(payload_json)
    try:
        result = perform_scrape(payload)
        prev = dict(jd[job_id])
        prev["status"] = "completed"
        prev["result"] = result
        jd[job_id] = prev
    except Exception as e:
        prev = dict(jd[job_id])
        prev["status"] = "failed"
        prev["error"] = str(e)
        jd[job_id] = prev


@app.function(
    image=light_image,
    secrets=[proxy_secret],
    timeout=120,
    cpu=1.0,
    memory=1024,
)
def batch_worker(batch_id: str, payload_json: str) -> None:
    bd = batches_dict()
    payload: dict = json.loads(payload_json)
    urls: list[str] = payload["urls"]
    mode = payload.get("mode") or "auto"
    formats = payload.get("formats") or ["markdown", "text", "json"]
    timeout = payload.get("timeout")
    hdrs = payload.get("headers")
    scrape_opts = payload.get("scrape_options") or {}
    wh = payload.get("webhook")

    st = dict(bd[batch_id])
    st["status"] = "running"
    bd[batch_id] = st

    if wh:
        _emit_crawl_webhook(
            {"webhook": wh},
            "batch.started",
            {"batch_id": batch_id, "total": len(urls)},
        )

    results: list[dict] = []
    for i, u in enumerate(urls):
        st = dict(bd[batch_id])
        if st.get("cancelled"):
            st["status"] = "cancelled"
            st["results"] = list(results)
            bd[batch_id] = st
            return
        single = merge_scrape_options({
            **scrape_opts,
            "url": u.strip(),
            "mode": mode,
            "formats": formats,
            "timeout": timeout,
            "headers": hdrs,
        })
        try:
            assert_public_http_url(u.strip())
            r = perform_scrape(single)
            results.append({"url": u, "ok": True, "result": r})
            if wh:
                _emit_crawl_webhook(
                    {"webhook": wh},
                    "batch.page",
                    {"batch_id": batch_id, "url": u, "index": i},
                )
        except Exception as e:
            results.append({"url": u, "ok": False, "error": str(e)})
        st = dict(bd[batch_id])
        st["progress"] = i + 1
        st["results"] = list(results)
        bd[batch_id] = st

    st = dict(bd[batch_id])
    st["status"] = "completed"
    st["results"] = results
    bd[batch_id] = st

    if wh:
        _emit_crawl_webhook(
            {"webhook": wh},
            "batch.completed",
            {"batch_id": batch_id, "completed": len(results)},
        )


def _webhook_should(ev: str, cfg: dict[str, Any] | None) -> bool:
    if not cfg:
        return False
    events = cfg.get("events")
    if not events:
        return True
    return ev in events


def _emit_crawl_webhook(
    state: dict[str, Any],
    event_type: str,
    payload: dict[str, Any],
) -> None:
    wh = state.get("webhook")
    if not wh or not isinstance(wh, dict):
        return
    if not _webhook_should(event_type, wh):
        return
    url = wh.get("url")
    secret = str(wh.get("secret") or "")
    if not url or not secret:
        return
    deliver_with_retries(
        url,
        secret,
        event_type,
        payload,
        metadata=wh.get("metadata") if isinstance(wh.get("metadata"), dict) else None,
    )


@app.function(
    image=light_image,
    secrets=[proxy_secret],
    timeout=300,
    cpu=1.0,
    memory=2048,
)
def crawl_step_worker(crawl_id: str) -> None:
    from scrape_core import build_headers

    logger.info("crawl_step_worker start crawl_id=%s", crawl_id)
    cd = crawls_dict()
    try:
        raw = dict(cd[crawl_id])
    except KeyError:
        return

    if time.time() - float(raw.get("created_at", 0)) > CRAWL_TTL_SEC:
        try:
            del cd[crawl_id]
        except KeyError:
            pass
        return

    if raw.get("cancelled"):
        raw["status"] = "cancelled"
        cd[crawl_id] = raw
        return

    cfg = raw.get("config") or {}
    seed = str(raw.get("seed") or "")
    rules = CrawlRules.from_dict({**cfg, "limit": cfg.get("limit", 100)}, seed)
    seed_host, seed_path = seed_parts(seed)
    scrape_opts_prior = (
        cfg.get("scrape_options") if isinstance(cfg.get("scrape_options"), dict) else {}
    )
    timeout = clamp_timeout(scrape_opts_prior.get("timeout"))

    ua = build_headers(None).get("User-Agent", "ScraplusBot/1.0")

    if raw.get("status") == "queued":
        raw["status"] = "running"
        cd[crawl_id] = raw
        _emit_crawl_webhook(
            raw,
            "crawl.started",
            {"crawl_id": crawl_id, "seed": seed},
        )

    frontier: list[dict[str, Any]] = list(raw.get("frontier") or [])
    visited: list[str] = list(raw.get("visited") or [])
    results: list[dict[str, Any]] = list(raw.get("results") or [])
    errors: list[dict[str, Any]] = list(raw.get("errors") or [])
    robots_bodies: dict[str, str | None] = dict(raw.get("robots_bodies") or {})
    sitemap_seeded = bool(raw.get("sitemap_seeded"))

    visited_set = set(visited)

    if not sitemap_seeded and rules.sitemap_mode != "skip":
        sm_urls = fetch_sitemap_urls(
            seed, rules, timeout=timeout, max_urls=min(rules.limit * 2, 500)
        )
        for su in sm_urls:
            try:
                nu = normalize_url(su, ignore_query=rules.ignore_query_parameters)
                if url_matches_rules(nu, rules, seed_host, seed_path):
                    frontier.append({"url": nu, "depth": 0})
            except Exception:
                continue
        raw["sitemap_seeded"] = True
    if not sitemap_seeded and rules.sitemap_mode == "skip":
        raw["sitemap_seeded"] = True

    scrape_opts = scrape_opts_prior
    steps = 0
    max_conc = max(1, int(cfg.get("max_concurrency") or 1))

    while steps < CRAWL_STEP_URLS * max_conc and len(results) < rules.limit and frontier:
        if dict(cd[crawl_id]).get("cancelled"):
            raw["cancelled"] = True
            raw["status"] = "cancelled"
            raw["frontier"] = frontier
            raw["visited"] = visited
            raw["results"] = results
            raw["errors"] = errors
            raw["robots_bodies"] = robots_bodies
            cd[crawl_id] = raw
            return

        item = frontier.pop(0)
        url = str(item.get("url") or "")
        depth = int(item.get("depth") or 0)
        try:
            nu = normalize_url(url, ignore_query=rules.ignore_query_parameters)
        except Exception as e:
            errors.append({"url": url, "error": str(e)})
            steps += 1
            continue

        if nu in visited_set:
            steps += 1
            continue

        if rules.max_discovery_depth is not None and depth > rules.max_discovery_depth:
            steps += 1
            continue

        if not url_matches_rules(nu, rules, seed_host, seed_path):
            steps += 1
            continue

        if rules.robots_policy == "honor":
            from urllib.parse import urlparse as _urlparse

            p = _urlparse(nu)
            host = (p.hostname or "").lower()
            rkey = f"{p.scheme}://{host}"
            if rkey not in robots_bodies:
                robots_bodies[rkey] = fetch_robots_txt(host, p.scheme or "https", timeout=timeout)
            if not can_fetch_url_robots(
                nu, robots_body=robots_bodies[rkey], user_agent=ua
            ):
                errors.append({"url": nu, "error": "Blocked by robots.txt"})
                visited.append(nu)
                visited_set.add(nu)
                steps += 1
                continue

        apply_delay(rules.delay_sec)

        single = merge_scrape_options({
            **scrape_opts,
            "url": nu,
            "mode": scrape_opts.get("mode") or "auto",
            "formats": scrape_opts.get("formats") or ["markdown", "text"],
            "timeout": scrape_opts.get("timeout") or timeout,
            "headers": scrape_opts.get("headers") or cfg.get("headers"),
        })

        try:
            assert_public_http_url(nu)
            page_result = perform_scrape(single)
            results.append(
                {
                    "url": nu,
                    "ok": True,
                    "depth": depth,
                    "result": page_result,
                }
            )
            visited.append(nu)
            visited_set.add(nu)
            _emit_crawl_webhook(
                raw,
                "crawl.page",
                {"crawl_id": crawl_id, "url": nu, "page": page_result},
            )

            if rules.sitemap_mode != "only":
                meta = page_result.get("metadata") or {}
                ctype = meta.get("content_type") or ""
                if "html" in ctype.lower() or page_result.get("engine", {}).get("name") in (
                    "httpx",
                    "playwright",
                ):
                    html_frag = (page_result.get("content") or {}).get("html")
                    if isinstance(html_frag, str) and html_frag:
                        for link in extract_links_from_html(html_frag, nu):
                            try:
                                ln = normalize_url(
                                    link, ignore_query=rules.ignore_query_parameters
                                )
                            except Exception:
                                continue
                            if ln in visited_set:
                                continue
                            nd = depth + 1
                            if (
                                rules.max_discovery_depth is not None
                                and nd > rules.max_discovery_depth
                            ):
                                continue
                            if url_matches_rules(ln, rules, seed_host, seed_path):
                                frontier.append({"url": ln, "depth": nd})
        except Exception as e:
            errors.append({"url": nu, "error": str(e)})
            visited.append(nu)
            visited_set.add(nu)

        steps += 1

    raw["frontier"] = frontier
    raw["visited"] = visited
    raw["results"] = results
    raw["errors"] = errors
    raw["robots_bodies"] = robots_bodies
    raw["progress"] = len(results)

    done = (
        not frontier
        or len(results) >= rules.limit
        or raw.get("cancelled")
    )
    if done:
        raw["status"] = "cancelled" if raw.get("cancelled") else "completed"
        cd[crawl_id] = raw
        ev = "crawl.failed" if raw.get("cancelled") else "crawl.completed"
        _emit_crawl_webhook(
            raw,
            ev,
            {
                "crawl_id": crawl_id,
                "completed": len(results),
                "errors_count": len(errors),
            },
        )
    else:
        cd[crawl_id] = raw
        crawl_step_worker.spawn(crawl_id)


@app.function(
    image=light_image,
    secrets=[proxy_secret],
    timeout=120,
    cpu=1.0,
    memory=1024,
)
def extract_llm_worker(job_id: str, payload_json: str) -> None:
    jd = extract_jobs_dict()
    payload: dict = json.loads(payload_json)
    try:
        urls = payload.get("urls") or []
        html = payload.get("html")
        data = llm_extract_sync(
            html=html,
            prompt=str(payload.get("prompt") or ""),
            schema=payload.get("schema"),
            urls=urls if urls else None,
        )
        prev = dict(jd[job_id])
        prev["status"] = "completed"
        prev["data"] = data
        jd[job_id] = prev
    except Exception as e:
        prev = dict(jd[job_id])
        prev["status"] = "failed"
        prev["error"] = str(e)
        jd[job_id] = prev


@app.function(
    image=browser_image,
    secrets=[proxy_secret],
    timeout=120,
    cpu=1.0,
    memory=2048,
)
def interact_worker(body: dict) -> dict:
    from playwright.sync_api import sync_playwright
    from scrape_core import build_response_from_html, clamp_timeout, build_headers

    url = body["url"]
    assert_public_http_url(url)
    timeout = clamp_timeout(body.get("timeout"))
    hdrs = build_headers(body.get("headers"))
    formats = body.get("formats") or ["markdown", "text", "json"]
    actions = body.get("actions") or []
    timeout_ms = int(timeout * 1000)

    ua = hdrs.get("User-Agent")
    extra = {k: v for k, v in hdrs.items() if k.lower() != "user-agent"}

    action_results: list[dict[str, Any]] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            ctx = browser.new_context(user_agent=ua, extra_http_headers=extra)
            page = ctx.new_page()
            page.set_default_timeout(timeout_ms)
            resp = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            status_code = int(resp.status) if resp else 200

            for act in actions:
                atype = act.get("type", "").lower()
                sel = act.get("selector")
                try:
                    if atype == "click" and sel:
                        page.click(sel, timeout=timeout_ms)
                        action_results.append({"type": "click", "selector": sel, "ok": True})
                    elif atype == "type" and sel:
                        text = act.get("text", "")
                        page.fill(sel, text, timeout=timeout_ms)
                        action_results.append({"type": "type", "selector": sel, "ok": True})
                    elif atype == "scroll":
                        value = int(act.get("value") or 500)
                        page.evaluate(f"window.scrollBy(0, {value})")
                        action_results.append({"type": "scroll", "value": value, "ok": True})
                    elif atype == "wait":
                        import time as _time
                        wait_ms = min(int(act.get("value") or 1000), 30000)
                        _time.sleep(wait_ms / 1000.0)
                        action_results.append({"type": "wait", "ms": wait_ms, "ok": True})
                    elif atype == "screenshot":
                        import base64
                        shot = base64.b64encode(page.screenshot(type="png", full_page=False)).decode("ascii")
                        action_results.append({"type": "screenshot", "ok": True, "screenshot_base64": shot})
                    else:
                        action_results.append({"type": atype, "ok": False, "error": f"Unknown action: {atype}"})
                except Exception as e:
                    action_results.append({"type": atype, "ok": False, "error": str(e)})

            html = page.content()
            final_url = page.url
        finally:
            browser.close()

    result = build_response_from_html(
        html, formats, final_url, status_code, "text/html",
        engine="playwright", escalated=False, body=body,
    )
    result["actions"] = action_results
    return result


@app.function(
    image=light_image,
    secrets=[proxy_secret],
    timeout=120,
    cpu=1.0,
    memory=1024,
)
@modal.asgi_app()
def scraplus_api():
    web = FastAPI(title="Scraplus API", version="1.0.0")

    @web.middleware("http")
    async def auth_mid(request: Request, call_next):
        p = request.url.path
        if request.method == "OPTIONS" or p == "/health":
            return await call_next(request)
        verify_proxy_secret(request)
        return await call_next(request)

    @web.get("/health")
    def health():
        return {"ok": True}

    @web.post("/scrape")
    def post_scrape(req: ScrapeRequest):
        try:
            body = scrape_body_from_scrape_request(req)
            assert_public_http_url(body["url"])
            if req.async_job:
                job_id = str(uuid.uuid4())
                now = time.time()
                jobs_dict()[job_id] = {
                    "status": "pending",
                    "created_at": now,
                }
                scrape_job_worker.spawn(job_id, json.dumps(body, default=str))
                return {"job_id": job_id, "status": "pending"}
            return perform_scrape(body)
        except ValueError as e:
            if str(e) == "SCRAPE_NO_CACHED_DATA":
                raise HTTPException(status_code=404, detail=str(e)) from e
            raise HTTPException(status_code=400, detail=str(e)) from e
        except SsrfError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e)) from e

    @web.get("/jobs/{job_id}")
    def get_job(job_id: str):
        jd = jobs_dict()
        try:
            raw = dict(jd[job_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Job not found") from None
        data = touch_ttl(raw, JOB_TTL_SEC)
        if data is None:
            try:
                del jd[job_id]
            except KeyError:
                pass
            raise HTTPException(status_code=404, detail="Job expired") from None
        return data

    @web.post("/batch")
    def post_batch(req: BatchRequest):
        if not req.urls:
            raise HTTPException(status_code=400, detail="No URLs")
        if len(req.urls) > 100:
            raise HTTPException(status_code=400, detail="Too many URLs (max 100)")
        cleaned: list[str] = []
        for u in req.urls:
            u = u.strip()
            if not u:
                continue
            try:
                assert_public_http_url(u)
                cleaned.append(u)
            except SsrfError as e:
                raise HTTPException(
                    status_code=400, detail=f"Blocked URL {u}: {e}"
                ) from e

        batch_id = str(uuid.uuid4())
        now = time.time()
        wh = None
        if req.webhook:
            wh = {
                "url": req.webhook.url,
                "secret": req.webhook.secret,
                "events": req.webhook.events,
                "metadata": req.webhook.metadata or {},
            }
        payload = {
            "urls": cleaned,
            "mode": req.mode,
            "formats": req.formats,
            "timeout": req.timeout,
            "headers": req.headers,
            "scrape_options": req.scrape_options or {},
            "webhook": wh,
        }
        batches_dict()[batch_id] = {
            "created_at": now,
            "status": "queued",
            "cancelled": False,
            "urls": cleaned,
            "progress": 0,
            "results": [],
        }
        batch_worker.spawn(batch_id, json.dumps(payload, default=str))
        return {"batch_id": batch_id, "status": "queued"}

    @web.get("/batch/{batch_id}")
    def get_batch(batch_id: str):
        bd = batches_dict()
        try:
            raw = dict(bd[batch_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Batch not found") from None
        data = touch_ttl(raw, JOB_TTL_SEC)
        if data is None:
            try:
                del bd[batch_id]
            except KeyError:
                pass
            raise HTTPException(status_code=404, detail="Batch expired") from None
        return data

    @web.post("/batch/{batch_id}/cancel")
    def cancel_batch(batch_id: str):
        bd = batches_dict()
        try:
            raw = dict(bd[batch_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Batch not found") from None
        data = touch_ttl(raw, JOB_TTL_SEC)
        if data is None:
            raise HTTPException(status_code=404, detail="Batch expired") from None
        data["cancelled"] = True
        bd[batch_id] = data
        return {"batch_id": batch_id, "cancelled": True}

    @web.post("/crawl")
    def post_crawl(req: CrawlRequest):
        try:
            seed = assert_public_http_url(req.url.strip())
            cfg = req.model_dump(exclude={"url", "webhook"}, exclude_none=False)
            cfg["limit"] = req.limit
            crawl_id = str(uuid.uuid4())
            now = time.time()
            wh = None
            if req.webhook:
                wh = {
                    "url": req.webhook.url,
                    "secret": req.webhook.secret,
                    "events": req.webhook.events,
                    "metadata": req.webhook.metadata or {},
                }
            rules = CrawlRules.from_dict(cfg, seed)
            frontier: list[dict[str, Any]] = []
            if rules.sitemap_mode != "only":
                try:
                    frontier.append(
                        {
                            "url": normalize_url(
                                seed,
                                ignore_query=rules.ignore_query_parameters,
                            ),
                            "depth": 0,
                        }
                    )
                except Exception as e:
                    raise HTTPException(status_code=400, detail=str(e)) from e

            crawls_dict()[crawl_id] = {
                "created_at": now,
                "status": "queued",
                "seed": seed,
                "config": cfg,
                "frontier": frontier,
                "visited": [],
                "results": [],
                "errors": [],
                "cancelled": False,
                "webhook": wh,
                "robots_bodies": {},
                "sitemap_seeded": False,
                "progress": 0,
            }
            crawl_step_worker.spawn(crawl_id)
            return {"crawl_id": crawl_id, "status": "queued"}
        except SsrfError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    @web.get("/crawl/{crawl_id}")
    def get_crawl(crawl_id: str, skip: int = 0, page_limit: int = 50):
        cd = crawls_dict()
        try:
            raw = dict(cd[crawl_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Crawl not found") from None
        data = touch_ttl(raw, CRAWL_TTL_SEC)
        if data is None:
            try:
                del cd[crawl_id]
            except KeyError:
                pass
            raise HTTPException(status_code=404, detail="Crawl expired") from None
        results = list(data.get("results") or [])
        skip = max(0, skip)
        page_limit = max(1, min(200, page_limit))
        slice_res = results[skip : skip + page_limit]
        next_skip = skip + page_limit if skip + page_limit < len(results) else None
        return {
            "crawl_id": crawl_id,
            "status": data.get("status"),
            "progress": data.get("progress"),
            "completed": len(results),
            "frontier_size": len(data.get("frontier") or []),
            "data": slice_res,
            "next": next_skip,
            "errors": data.get("errors") or [],
        }

    @web.get("/crawl/{crawl_id}/errors")
    def get_crawl_errors(crawl_id: str):
        cd = crawls_dict()
        try:
            raw = dict(cd[crawl_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Crawl not found") from None
        data = touch_ttl(raw, CRAWL_TTL_SEC)
        if data is None:
            raise HTTPException(status_code=404, detail="Crawl expired") from None
        return {"crawl_id": crawl_id, "errors": data.get("errors") or []}

    @web.post("/crawl/{crawl_id}/cancel")
    def cancel_crawl(crawl_id: str):
        cd = crawls_dict()
        try:
            raw = dict(cd[crawl_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Crawl not found") from None
        data = touch_ttl(raw, CRAWL_TTL_SEC)
        if data is None:
            raise HTTPException(status_code=404, detail="Crawl expired") from None
        data["cancelled"] = True
        cd[crawl_id] = data
        return {"crawl_id": crawl_id, "cancelled": True}

    @web.post("/extract")
    def post_extract(req: SelectorExtractRequest):
        try:
            assert_public_http_url(req.url.strip())
            so = dict(req.scrape_options or {})
            body = merge_scrape_options({
                **so,
                "url": req.url.strip(),
                "mode": req.mode,
                "timeout": req.timeout,
                "headers": req.headers,
                "formats": ["html"],
            })
            res = perform_scrape(body)
            html = (res.get("content") or {}).get("html") or ""
            if not isinstance(html, str):
                html = ""
            data = extract_with_selectors(html, req.selectors)
            if req.schema:
                try:
                    jsonschema_validate(instance=data, schema=req.schema)
                except ValidationError as e:
                    raise HTTPException(status_code=422, detail=str(e.message)) from e
            return {"success": True, "data": data, "source_url": res.get("url")}
        except SsrfError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e)) from e

    @web.post("/extract/llm")
    def post_extract_llm(req: LLMExtractRequest):
        try:
            urls: list[str] = list(req.urls or [])
            if req.url:
                urls.insert(0, req.url.strip())
            urls = [assert_public_http_url(u.strip()) for u in urls if u.strip()]
            html: str | None = None
            if urls:
                body = merge_scrape_options({
                    "url": urls[0],
                    "mode": req.mode,
                    "timeout": req.timeout,
                    "headers": req.headers,
                    "formats": ["html"],
                })
                pres = perform_scrape(body)
                html = (pres.get("content") or {}).get("html")
                html = html if isinstance(html, str) else None

            if req.async_job:
                job_id = str(uuid.uuid4())
                extract_jobs_dict()[job_id] = {
                    "status": "pending",
                    "created_at": time.time(),
                }
                extract_llm_worker.spawn(
                    job_id,
                    json.dumps(
                        {
                            "urls": urls,
                            "html": html,
                            "prompt": req.prompt,
                            "schema": req.schema,
                        },
                        default=str,
                    ),
                )
                return {"job_id": job_id, "status": "pending"}

            data = llm_extract_sync(
                html=html,
                prompt=req.prompt,
                schema=req.schema,
                urls=urls if len(urls) > 1 else None,
            )
            return {"success": True, "status": "completed", "data": data}
        except SsrfError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e)) from e

    @web.get("/extract/{job_id}")
    def get_extract_job(job_id: str):
        jd = extract_jobs_dict()
        try:
            raw = dict(jd[job_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Job not found") from None
        data = touch_ttl(raw, JOB_TTL_SEC)
        if data is None:
            raise HTTPException(status_code=404, detail="Job expired") from None
        return data

    @web.post("/map")
    def post_map(req: MapRequest):
        try:
            urls = discover_urls(
                req.url.strip(),
                limit=req.limit,
                ignore_sitemap=req.ignore_sitemap,
                include_subdomains=req.include_subdomains,
                search=req.search,
                timeout=clamp_timeout(req.timeout),
            )
            return {"success": True, "links": urls}
        except SsrfError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e)) from e

    @web.post("/search")
    def post_search(req: SearchRequest):
        api_key = (
            os.environ.get("SCRAPLUS_SEARCH_API_KEY")
            or os.environ.get("BRAVE_SEARCH_API_KEY")
            or ""
        ).strip()
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="Search requires SCRAPLUS_SEARCH_API_KEY or BRAVE_SEARCH_API_KEY",
            )
        try:
            import httpx as _httpx

            params: dict[str, Any] = {
                "q": req.query,
                "count": max(1, min(100, req.limit)),
            }
            if req.lang:
                params["search_lang"] = req.lang
            if req.location:
                params["country"] = req.location

            t = _httpx.Timeout(30.0, connect=10.0)
            with _httpx.Client(timeout=t) as client:
                r = client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    params=params,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip",
                        "X-Subscription-Token": api_key,
                    },
                )
                r.raise_for_status()
                search_data = r.json()

            results_raw = search_data.get("web", {}).get("results", [])
            data: list[dict[str, Any]] = []
            for item in results_raw[: req.limit]:
                entry: dict[str, Any] = {
                    "url": item.get("url", ""),
                    "title": item.get("title", ""),
                    "description": item.get("description", ""),
                }
                if req.scrape_options:
                    so = req.scrape_options
                    u = entry["url"]
                    try:
                        assert_public_http_url(u)
                        scrape_body = merge_scrape_options({
                            **so,
                            "url": u,
                            "mode": so.get("mode") or "auto",
                            "formats": so.get("formats") or ["markdown"],
                            "timeout": clamp_timeout(req.timeout),
                        })
                        page = perform_scrape(scrape_body)
                        entry["content"] = page.get("content")
                        entry["metadata"] = page.get("metadata")
                    except Exception:
                        pass
                data.append(entry)
            return {"success": True, "data": data}
        except _httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail=f"Search API error: {e}") from e
        except SsrfError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e)) from e

    @web.post("/interact")
    def post_interact(req: InteractRequest):
        try:
            assert_public_http_url(req.url.strip())
            body: dict[str, Any] = {
                "url": req.url.strip(),
                "actions": [a.model_dump(exclude_none=True) for a in req.actions],
                "timeout": clamp_timeout(req.timeout),
                "formats": req.formats or ["markdown", "text", "json"],
            }
            if req.headers:
                body["headers"] = req.headers
            result = interact_worker.remote(body)
            return result
        except SsrfError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e)) from e

    # ── Schedules ────────────────────────────────────────────────────────

    @web.post("/schedules")
    def create_schedule(request: Request):
        import json as _json
        body = _json.loads(request._body if hasattr(request, "_body") else "{}")
        # FastAPI will have already parsed - use sync approach
        return _create_schedule_impl(body)

    @web.post("/schedules/create")
    def create_schedule_alt(body: dict = {}):
        return _create_schedule_impl(body)

    def _create_schedule_impl(body: dict) -> dict:
        errs = validate_schedule(body)
        if errs:
            raise HTTPException(status_code=400, detail="; ".join(errs))
        sid = str(uuid.uuid4())
        now = time.time()
        entry = {
            "id": sid,
            "url": str(body["url"]).strip(),
            "cron": str(body["cron"]).strip(),
            "name": str(body.get("name") or ""),
            "enabled": bool(body.get("enabled", True)),
            "scrape_options": body.get("scrape_options") or {},
            "webhook": body.get("webhook"),
            "created_at": now,
            "updated_at": now,
            "last_run_at": None,
            "next_run_at": None,
            "run_count": 0,
        }
        from datetime import datetime, timezone
        try:
            nxt = next_run_after(entry["cron"], datetime.now(timezone.utc))
            if nxt:
                entry["next_run_at"] = nxt.isoformat()
        except Exception:
            pass
        sd = schedules_dict()
        sd[sid] = entry
        idx = _schedules_index(sd)
        idx.append(sid)
        sd["__index__"] = idx
        return {"id": sid, "status": "created", "schedule": entry}

    def _schedules_index(sd) -> list[str]:
        try:
            return list(sd["__index__"])
        except KeyError:
            return []

    @web.get("/schedules")
    def list_schedules():
        sd = schedules_dict()
        idx = _schedules_index(sd)
        items = []
        for sid in idx:
            try:
                items.append(dict(sd[sid]))
            except KeyError:
                continue
        return {"schedules": items}

    @web.get("/schedules/{schedule_id}")
    def get_schedule(schedule_id: str):
        sd = schedules_dict()
        try:
            entry = dict(sd[schedule_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Schedule not found") from None
        rd = schedule_runs_dict()
        runs = []
        try:
            run_ids = list(rd[f"__runs__{schedule_id}"])
            for rid in run_ids[-20:]:
                try:
                    runs.append(dict(rd[rid]))
                except KeyError:
                    continue
        except KeyError:
            pass
        return {"schedule": entry, "runs": runs}

    @web.patch("/schedules/{schedule_id}")
    def update_schedule(schedule_id: str, request: Request):
        sd = schedules_dict()
        try:
            entry = dict(sd[schedule_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Schedule not found") from None
        import json as _json
        try:
            body = _json.loads(request._body if hasattr(request, "_body") else "{}")
        except Exception:
            body = {}
        if "cron" in body:
            try:
                parse_cron(str(body["cron"]))
                entry["cron"] = str(body["cron"])
            except (ValueError, IndexError):
                raise HTTPException(status_code=400, detail="Invalid cron") from None
        if "enabled" in body:
            entry["enabled"] = bool(body["enabled"])
        if "name" in body:
            entry["name"] = str(body["name"])
        if "scrape_options" in body:
            entry["scrape_options"] = body["scrape_options"] or {}
        if "webhook" in body:
            entry["webhook"] = body["webhook"]
        entry["updated_at"] = time.time()
        from datetime import datetime, timezone
        try:
            nxt = next_run_after(entry["cron"], datetime.now(timezone.utc))
            if nxt:
                entry["next_run_at"] = nxt.isoformat()
        except Exception:
            pass
        sd[schedule_id] = entry
        return {"schedule": entry}

    @web.delete("/schedules/{schedule_id}")
    def delete_schedule(schedule_id: str):
        sd = schedules_dict()
        try:
            del sd[schedule_id]
        except KeyError:
            raise HTTPException(status_code=404, detail="Schedule not found") from None
        idx = _schedules_index(sd)
        idx = [s for s in idx if s != schedule_id]
        sd["__index__"] = idx
        return {"deleted": True}

    @web.get("/schedules/{schedule_id}/runs")
    def list_schedule_runs(schedule_id: str, skip: int = 0, limit: int = 50):
        rd = schedule_runs_dict()
        try:
            run_ids = list(rd[f"__runs__{schedule_id}"])
        except KeyError:
            run_ids = []
        run_ids = list(reversed(run_ids))
        sliced = run_ids[skip : skip + limit]
        runs = []
        for rid in sliced:
            try:
                runs.append(dict(rd[rid]))
            except KeyError:
                continue
        return {"runs": runs, "total": len(run_ids)}

    @web.get("/schedules/{schedule_id}/runs/{run_id}")
    def get_schedule_run(schedule_id: str, run_id: str):
        rd = schedule_runs_dict()
        try:
            return dict(rd[run_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Run not found") from None

    # ── Monitors ─────────────────────────────────────────────────────────

    @web.post("/monitors")
    def create_monitor(body: dict = {}):
        if not body.get("url"):
            raise HTTPException(status_code=400, detail="url is required")
        if not body.get("cron"):
            raise HTTPException(status_code=400, detail="cron is required")
        try:
            parse_cron(str(body["cron"]))
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid cron") from None

        mid = str(uuid.uuid4())
        now = time.time()
        entry = {
            "id": mid,
            "url": str(body["url"]).strip(),
            "cron": str(body["cron"]).strip(),
            "name": str(body.get("name") or ""),
            "enabled": bool(body.get("enabled", True)),
            "diff_mode": str(body.get("diff_mode") or "exact"),
            "selectors": body.get("selectors"),
            "webhook": body.get("webhook"),
            "created_at": now,
            "updated_at": now,
            "last_check_at": None,
            "change_count": 0,
            "check_count": 0,
        }
        from datetime import datetime, timezone
        try:
            nxt = next_run_after(entry["cron"], datetime.now(timezone.utc))
            if nxt:
                entry["next_check_at"] = nxt.isoformat()
        except Exception:
            pass
        md = monitors_dict()
        md[mid] = entry
        idx = _monitors_index(md)
        idx.append(mid)
        md["__index__"] = idx
        return {"id": mid, "status": "created", "monitor": entry}

    def _monitors_index(md) -> list[str]:
        try:
            return list(md["__index__"])
        except KeyError:
            return []

    @web.get("/monitors")
    def list_monitors():
        md = monitors_dict()
        idx = _monitors_index(md)
        items = []
        for mid in idx:
            try:
                items.append(dict(md[mid]))
            except KeyError:
                continue
        return {"monitors": items}

    @web.get("/monitors/{monitor_id}")
    def get_monitor(monitor_id: str):
        md = monitors_dict()
        try:
            entry = dict(md[monitor_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Monitor not found") from None
        return {"monitor": entry}

    @web.patch("/monitors/{monitor_id}")
    def update_monitor(monitor_id: str, body: dict = {}):
        md = monitors_dict()
        try:
            entry = dict(md[monitor_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Monitor not found") from None
        if "cron" in body:
            try:
                parse_cron(str(body["cron"]))
                entry["cron"] = str(body["cron"])
            except (ValueError, IndexError):
                raise HTTPException(status_code=400, detail="Invalid cron") from None
        for k in ("enabled", "name", "diff_mode", "selectors", "webhook"):
            if k in body:
                entry[k] = body[k]
        entry["updated_at"] = time.time()
        md[monitor_id] = entry
        return {"monitor": entry}

    @web.delete("/monitors/{monitor_id}")
    def delete_monitor(monitor_id: str):
        md = monitors_dict()
        try:
            del md[monitor_id]
        except KeyError:
            raise HTTPException(status_code=404, detail="Monitor not found") from None
        idx = _monitors_index(md)
        idx = [m for m in idx if m != monitor_id]
        md["__index__"] = idx
        return {"deleted": True}

    @web.get("/monitors/{monitor_id}/changes")
    def list_monitor_changes(monitor_id: str, skip: int = 0, limit: int = 50):
        sd = monitor_snapshots_dict()
        try:
            change_ids = list(sd[f"__changes__{monitor_id}"])
        except KeyError:
            change_ids = []
        change_ids = list(reversed(change_ids))
        sliced = change_ids[skip : skip + limit]
        changes = []
        for cid in sliced:
            try:
                changes.append(dict(sd[cid]))
            except KeyError:
                continue
        return {"changes": changes, "total": len(change_ids)}

    # ── API Keys & Usage ─────────────────────────────────────────────────

    @web.post("/auth/keys")
    def create_api_key(body: dict = {}):
        import hashlib as _hashlib
        import secrets as _secrets
        raw_key = f"sk_live_{_secrets.token_hex(24)}"
        key_hash = _hashlib.sha256(raw_key.encode()).hexdigest()
        kid = str(uuid.uuid4())
        now = time.time()
        entry = {
            "id": kid,
            "key_hash": key_hash,
            "prefix": raw_key[:12] + "..." + raw_key[-4:],
            "name": str(body.get("name") or ""),
            "created_at": now,
            "last_used_at": None,
            "revoked": False,
        }
        kd = api_keys_dict()
        kd[kid] = entry
        kd[f"__hash__{key_hash}"] = kid
        idx: list[str] = []
        try:
            idx = list(kd["__index__"])
        except KeyError:
            pass
        idx.append(kid)
        kd["__index__"] = idx
        return {"id": kid, "key": raw_key, "prefix": entry["prefix"]}

    @web.get("/auth/keys")
    def list_api_keys():
        kd = api_keys_dict()
        idx: list[str] = []
        try:
            idx = list(kd["__index__"])
        except KeyError:
            pass
        keys = []
        for kid in idx:
            try:
                entry = dict(kd[kid])
                if not entry.get("revoked"):
                    keys.append({
                        "id": entry["id"],
                        "prefix": entry["prefix"],
                        "name": entry.get("name", ""),
                        "created_at": entry["created_at"],
                        "last_used_at": entry.get("last_used_at"),
                    })
            except KeyError:
                continue
        return {"keys": keys}

    @web.delete("/auth/keys/{key_id}")
    def revoke_api_key(key_id: str):
        kd = api_keys_dict()
        try:
            entry = dict(kd[key_id])
        except KeyError:
            raise HTTPException(status_code=404, detail="Key not found") from None
        entry["revoked"] = True
        kd[key_id] = entry
        return {"revoked": True}

    @web.get("/usage")
    def get_usage():
        ud = usage_dict()
        try:
            data = dict(ud["__global__"])
        except KeyError:
            data = {
                "total_requests": 0,
                "success": 0,
                "failed": 0,
                "last_request_at": None,
            }
        return data

    return web
