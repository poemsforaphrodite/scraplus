# Scraplus

Next.js dashboard and API gateway for a [Modal](https://modal.com)-hosted scrape backend (HTTP + Playwright paths), with **recursive crawl**, **deterministic / LLM extract**, **signed webhooks**, and optional **HTTP cache** (Modal Dict).

## Product scope (roadmap alignment)

- **In scope:** Firecrawl-style **crawl** (sitemap + link discovery, path rules, depth, `robots.txt` honor option), **scrape options** (`only_main_content`, tag filters, `wait_ms`, mobile emulation, TLS/proxy, PDF modes, `max_age_ms` / `min_age_ms` cache), **selector extract** + **LLM extract** (OpenAI-compatible), **crawl webhooks** (HMAC-SHA256 on `X-Scraplus-Signature`).
- **Out of scope (for now):** Managed **anti-bot**, **CAPTCHA** solvers, residential proxy **tiering** — use your own `proxy` / headers or a third-party API for hostile sites.
- **Build vs integrate:** Self-hosted Modal handles most flows; for edge cases you can still call external vendors from your app while using Scraplus for simple sites.
- **Extract semantics:** **Deterministic** extract = CSS selectors + optional JSON Schema validation. **LLM** extract = prompt + optional schema (requires `SCRAPLUS_OPENAI_API_KEY` or `OPENAI_API_KEY` on Modal).
- **WebSockets:** Real-time crawl streaming is **not** implemented; use **webhooks** or polling.
- **Multi-tenant metering:** Per-key quotas and credits are only relevant if you productize beyond self-host.

## Modal operational notes

- **Function timeouts:** Default scrape/batch/jobs use **120s**; crawl steps use **300s** per chained invocation (`CRAWL_STEP_URLS` URLs per step). Very large crawls run as many steps as needed.
- **Job TTL:** Scrape/batch jobs expire after **600s** (`JOB_TTL_SEC`). Crawl state TTL is **7200s** (`CRAWL_TTL_SEC`).
- **Dict size:** Crawl results are stored in a Modal **Dict**; keep `limit` reasonable (max **500**). For huge payloads, add object storage in a later iteration.
- **LLM secrets (optional):** Create a Modal secret with `OPENAI_API_KEY` or `SCRAPLUS_OPENAI_API_KEY`, and attach it to functions that call `/extract/llm` if you use async LLM jobs from the dashboard API.

## Setup

```bash
npm ci
cp .env.example .env.local
# Set SCRAPLUS_MODAL_BASE_URL and SCRAPLUS_PROXY_SECRET, then:
npm run dev
```

Python tests and Modal app live under `modal_app/`. For local Python tests:

```bash
cd modal_app && python3 -m venv .venv && .venv/bin/pip install -r requirements-light.txt pytest
.venv/bin/python -m pytest
```

See `.env.example` for gateway env vars. Optional: `SCRAPLUS_HTTP_PROXY` for default egress proxy on the Modal worker.

## API summary (Modal ASGI)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/scrape` | Single URL scrape (extended options + cache) |
| POST | `/batch` | Up to 100 URLs |
| POST | `/crawl` | Start recursive crawl |
| GET | `/crawl/{id}` | Status + paginated `data` (`skip`, `page_limit`) |
| GET | `/crawl/{id}/errors` | Crawl-level failures |
| POST | `/crawl/{id}/cancel` | Cancel |
| POST | `/extract` | Selector-based JSON extract |
| POST | `/extract/llm` | LLM extract (sync or `async`) |
| GET | `/extract/{job_id}` | LLM async job status |

Webhooks: `POST` body includes `X-Scraplus-Signature: sha256=<hex>` over the raw JSON body. Verify with HMAC-SHA256 and your crawl `webhook.secret`.

**Deferred:** Firecrawl-style multi-step browser **interact** API (post-load clicks/typing) is not implemented.

## Deploy

- **Gateway:** connect this repo on Vercel; set production env from `.env.example`.
- **Scraper:** deploy with Modal (`modal deploy modal_app/app.py`) using your Modal account.
