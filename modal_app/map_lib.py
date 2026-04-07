"""Fast URL discovery from a site (sitemaps + shallow link extraction) -- no full scrape."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from crawl_lib import (
    CrawlRules,
    fetch_sitemap_urls,
    normalize_url,
)
from scrape_core import build_headers, clamp_timeout
from ssrf import SsrfError, assert_public_http_url


def _host_matches(url: str, seed_host: str, *, include_subdomains: bool) -> bool:
    try:
        h = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    s = seed_host.lower()
    if h == s:
        return True
    if include_subdomains and h.endswith("." + s):
        return True
    return False


def discover_urls(
    seed: str,
    *,
    limit: int = 5000,
    ignore_sitemap: bool = False,
    include_subdomains: bool = True,
    search: str | None = None,
    timeout: float = 15.0,
) -> list[str]:
    seed = assert_public_http_url(seed.strip())
    timeout = clamp_timeout(timeout)
    limit = max(1, min(30_000, limit))

    p = urlparse(seed)
    seed_host = (p.hostname or "").lower()
    seen: set[str] = set()
    result: list[str] = []

    if not ignore_sitemap:
        rules = CrawlRules(
            seed_url=seed,
            limit=limit,
            max_discovery_depth=None,
            include_paths=[],
            exclude_paths=[],
            regex_on_full_url=False,
            crawl_entire_domain=True,
            allow_subdomains=include_subdomains,
            allow_external_links=False,
            sitemap_mode="include",
            ignore_query_parameters=False,
            delay_sec=0,
            robots_policy="ignore",
        )
        sm_urls = fetch_sitemap_urls(seed, rules, timeout=timeout, max_urls=min(limit * 2, 30_000))
        for u in sm_urls:
            if len(result) >= limit:
                break
            try:
                nu = normalize_url(u, ignore_query=False)
                if nu not in seen and _host_matches(nu, seed_host, include_subdomains=include_subdomains):
                    seen.add(nu)
                    result.append(nu)
            except (SsrfError, ValueError):
                continue

    if len(result) < limit:
        try:
            t = httpx.Timeout(timeout + 2.0, connect=min(10.0, timeout))
            with httpx.Client(timeout=t, follow_redirects=True) as client:
                r = client.get(seed, headers=build_headers(None))
                if r.status_code == 200 and "html" in (r.headers.get("content-type") or "").lower():
                    html = r.text[:2_000_000]
                    soup = BeautifulSoup(html, "lxml")
                    for a in soup.find_all("a", href=True):
                        if len(result) >= limit:
                            break
                        href = str(a["href"]).strip()
                        if not href or href.startswith(("#", "javascript:", "mailto:")):
                            continue
                        joined = urljoin(seed, href)
                        try:
                            nu = normalize_url(joined, ignore_query=False)
                            if nu not in seen and _host_matches(nu, seed_host, include_subdomains=include_subdomains):
                                seen.add(nu)
                                result.append(nu)
                        except (SsrfError, ValueError):
                            continue
        except Exception:
            pass

    if seed not in seen:
        result.insert(0, seed)

    if search:
        pat = re.compile(re.escape(search), re.IGNORECASE)
        result = [u for u in result if pat.search(u)]

    return result[:limit]
