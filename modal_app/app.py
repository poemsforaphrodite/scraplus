"""Scraplus Modal app — deploy: `modal deploy modal_app/app.py` from repo root."""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import modal
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

# playwright_scrape imports playwright — only installed on browser_image. Lazy-import inside
# scrape_playwright_fn so light_image workers (API, batch, job) can load app.py.
from scrape_core import (
    clamp_timeout,
    scrape_http_html,
    scrape_ocr,
    scrape_pdf,
    should_escalate_to_playwright,
)
from ssrf import SsrfError, assert_public_http_url

APP_NAME = "scraplus"
JOB_TTL_SEC = 600
JOBS_DICT = "scraplus-jobs-v1"
BATCH_DICT = "scraplus-batches-v1"

# Multi-file app: Modal only injects the entrypoint module unless you add the rest of the tree.
# Per Modal docs — use Image.add_local_dir(..., remote_path="/root") for a full directory, or
# add_local_python_source("packagename") for importable packages on PYTHONPATH (see modal.Image).
# https://modal.com/docs/reference/modal.Image#add_local_dir
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

# Create with: modal secret create scraplus-proxy-secret SCRAPLUS_PROXY_SECRET=...
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


def touch_ttl(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not data:
        return None
    created = float(data.get("created_at", 0))
    if time.time() - created > JOB_TTL_SEC:
        return None
    return data


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


class BatchRequest(BaseModel):
    urls: list[str]
    mode: str = "auto"
    formats: list[str] | None = None
    timeout: float | None = None
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


def perform_scrape(body: dict) -> dict:
    """Orchestrates httpx + optional Playwright (remote)."""
    mode = (body.get("mode") or "auto").lower().strip()
    url = body["url"]
    assert_public_http_url(url)
    timeout = clamp_timeout(body.get("timeout"))
    headers = body.get("headers")
    formats = body.get("formats") or ["markdown", "text", "json"]

    if mode == "pdf":
        return scrape_pdf(url, timeout, headers, formats)
    if mode == "ocr":
        return scrape_ocr(url, timeout, headers, formats)

    if mode == "js":
        return scrape_playwright_fn.remote({**body, "url": url, "timeout": timeout})

    if mode == "html":
        res, _h = scrape_http_html(url, formats, timeout, headers)
        return res

    # auto
    res, html = scrape_http_html(url, formats, timeout, headers)
    if not should_escalate_to_playwright(html):
        return res
    out = scrape_playwright_fn.remote({**body, "url": url, "timeout": timeout})
    if isinstance(out, dict) and "engine" in out:
        out["engine"] = {**out["engine"], "escalated": True}
    return out


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

    st = dict(bd[batch_id])
    st["status"] = "running"
    bd[batch_id] = st

    results: list[dict] = []
    for i, u in enumerate(urls):
        st = dict(bd[batch_id])
        if st.get("cancelled"):
            st["status"] = "cancelled"
            st["results"] = list(results)
            bd[batch_id] = st
            return
        single = {
            "url": u.strip(),
            "mode": mode,
            "formats": formats,
            "timeout": timeout,
            "headers": hdrs,
        }
        try:
            assert_public_http_url(u.strip())
            r = perform_scrape(single)
            results.append({"url": u, "ok": True, "result": r})
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
            body: dict[str, Any] = {
                "url": req.url.strip(),
                "mode": req.mode,
                "formats": req.formats or ["markdown", "text", "json"],
                "timeout": req.timeout,
                "headers": req.headers,
                "wait_for": req.wait_for,
                "screenshot": req.screenshot,
            }
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
        except SsrfError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except ValueError as e:
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
        data = touch_ttl(raw)
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
        payload = {
            "urls": cleaned,
            "mode": req.mode,
            "formats": req.formats,
            "timeout": req.timeout,
            "headers": req.headers,
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
        data = touch_ttl(raw)
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
        data = touch_ttl(raw)
        if data is None:
            raise HTTPException(status_code=404, detail="Batch expired") from None
        data["cancelled"] = True
        bd[batch_id] = data
        return {"batch_id": batch_id, "cancelled": True}

    return web
