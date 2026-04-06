# Scraplus

Next.js dashboard and API gateway for a [Modal](https://modal.com)-hosted scrape backend (HTTP + Playwright paths).

## Setup

```bash
npm ci
cp .env.example .env.local
# Set SCRAPLUS_MODAL_BASE_URL and SCRAPLUS_PROXY_SECRET, then:
npm run dev
```

Python tests and Modal app live under `modal_app/`. See `.env.example` for gateway env vars.

## Deploy

- **Gateway:** connect this repo on Vercel; set production env from `.env.example`.
- **Scraper:** deploy with Modal (`modal deploy modal_app/app.py`) using your Modal account.
