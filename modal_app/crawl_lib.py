"""URL discovery, sitemap parsing, and crawl rules — no Modal imports."""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

from ssrf import SsrfError, assert_public_http_url


@dataclass(frozen=True)
class CrawlRules:
    seed_url: str
    limit: int
    max_discovery_depth: int | None
    include_paths: list[str]
    exclude_paths: list[str]
    regex_on_full_url: bool
    crawl_entire_domain: bool
    allow_subdomains: bool
    allow_external_links: bool
    sitemap_mode: str  # include | skip | only
    ignore_query_parameters: bool
    delay_sec: float
    robots_policy: str  # ignore | honor

    @staticmethod
    def from_dict(d: dict[str, Any], seed: str) -> CrawlRules:
        return CrawlRules(
            seed_url=seed.strip(),
            limit=max(1, min(int(d.get("limit") or 100), 500)),
            max_discovery_depth=(
                int(d["max_discovery_depth"])
                if d.get("max_discovery_depth") is not None
                else None
            ),
            include_paths=[
                str(x) for x in (d.get("include_paths") or []) if isinstance(x, str)
            ],
            exclude_paths=[
                str(x) for x in (d.get("exclude_paths") or []) if isinstance(x, str)
            ],
            regex_on_full_url=bool(d.get("regex_on_full_url")),
            crawl_entire_domain=bool(d.get("crawl_entire_domain")),
            allow_subdomains=bool(d.get("allow_subdomains")),
            allow_external_links=bool(d.get("allow_external_links")),
            sitemap_mode=str(d.get("sitemap") or "include").lower().strip(),
            ignore_query_parameters=bool(d.get("ignore_query_parameters")),
            delay_sec=max(0.0, float(d.get("delay_sec") or 0)),
            robots_policy=str(d.get("robots_policy") or "ignore").lower().strip(),
        )


def normalize_url(raw: str, *, ignore_query: bool) -> str:
    raw = assert_public_http_url(raw.strip())
    raw, _frag = urldefrag(raw)
    p = urlparse(raw)
    if ignore_query:
        raw = p._replace(query="", fragment="").geturl()
    return raw


def seed_parts(seed: str) -> tuple[str, str]:
    p = urlparse(seed)
    host = (p.hostname or "").lower()
    path = p.path or "/"
    if not path.endswith("/") and path != "":
        pass  # keep path as-is for prefix checks
    return host, path


def _host_allowed(
    host: str,
    seed_host: str,
    *,
    allow_subdomains: bool,
    allow_external: bool,
) -> bool:
    if allow_external:
        return True
    h = host.lower()
    s = seed_host.lower()
    if h == s:
        return True
    if allow_subdomains and h.endswith("." + s):
        return True
    return False


def _path_prefix_allowed(url: str, seed_path: str, crawl_entire_domain: bool) -> bool:
    if crawl_entire_domain:
        return True
    p = urlparse(url)
    path = p.path or "/"
    sp = seed_path or "/"
    if not sp.endswith("/"):
        sp = sp + "/"
    if path == (seed_path.rstrip("/") or ""):
        return True
    path_p = path if path.endswith("/") else path + "/"
    return path.startswith(sp) or path_p.startswith(sp)


def url_matches_rules(
    url: str,
    rules: CrawlRules,
    seed_host: str,
    seed_path: str,
) -> bool:
    try:
        p = urlparse(url)
    except Exception:
        return False
    host = (p.hostname or "").lower()
    if not _host_allowed(
        host,
        seed_host,
        allow_subdomains=rules.allow_subdomains,
        allow_external=rules.allow_external_links,
    ):
        return False
    if not _path_prefix_allowed(url, seed_path, rules.crawl_entire_domain):
        return False

    target = url if rules.regex_on_full_url else (p.path or "/")
    for pat in rules.exclude_paths:
        try:
            if re.search(pat, target):
                return False
        except re.error:
            continue
    if rules.include_paths:
        ok = False
        for pat in rules.include_paths:
            try:
                if re.search(pat, target):
                    ok = True
                    break
            except re.error:
                continue
        if not ok:
            return False
    return True


def fetch_sitemap_urls(
    seed: str,
    rules: CrawlRules,
    *,
    timeout: float,
    max_urls: int,
) -> list[str]:
    if rules.sitemap_mode == "skip":
        return []
    p = urlparse(seed)
    base = f"{p.scheme}://{p.netloc}"
    candidates = [
        urljoin(base + "/", "sitemap.xml"),
        urljoin(base + "/", "sitemap_index.xml"),
    ]
    out: list[str] = []
    seen_sitemaps: set[str] = set()

    def parse_sitemap_xml(raw_xml: str, depth: int) -> None:
        nonlocal out
        if depth > 5 or len(out) >= max_urls:
            return
        try:
            root = ET.fromstring(raw_xml)
        except ET.ParseError:
            return
        tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag
        if tag == "sitemapindex":
            for sm in root.findall(".//{*}sitemap") + root.findall("sitemap"):
                if len(out) >= max_urls:
                    break
                loc = sm.find("{*}loc")
                if loc is None:
                    loc = sm.find("loc")
                if loc is None or not loc.text:
                    continue
                child_url = loc.text.strip()
                try:
                    child_url = assert_public_http_url(child_url)
                except SsrfError:
                    continue
                if child_url in seen_sitemaps:
                    continue
                seen_sitemaps.add(child_url)
                try:
                    t = httpx.Timeout(timeout + 2.0, connect=min(10.0, timeout))
                    with httpx.Client(timeout=t, follow_redirects=True) as client:
                        cr = client.get(child_url)
                        if cr.status_code != 200:
                            continue
                        blob = cr.text
                except Exception:
                    continue
                parse_sitemap_xml(blob, depth + 1)
        elif tag == "urlset":
            for u in root.findall(".//{*}url") + root.findall("url"):
                if len(out) >= max_urls:
                    break
                loc = u.find("{*}loc")
                if loc is None:
                    loc = u.find("loc")
                if loc is None or not loc.text:
                    continue
                try:
                    nu = normalize_url(
                        loc.text.strip(), ignore_query=rules.ignore_query_parameters
                    )
                    assert_public_http_url(nu)
                    out.append(nu)
                except (SsrfError, ValueError):
                    continue

    for sm_url in candidates:
        if len(out) >= max_urls:
            break
        try:
            sm_url = assert_public_http_url(sm_url)
        except SsrfError:
            continue
        if sm_url in seen_sitemaps:
            continue
        seen_sitemaps.add(sm_url)
        try:
            t = httpx.Timeout(timeout + 2.0, connect=min(10.0, timeout))
            with httpx.Client(timeout=t, follow_redirects=True) as client:
                r = client.get(sm_url)
                if r.status_code != 200:
                    continue
                parse_sitemap_xml(r.text, 0)
        except Exception:
            continue
    return out[:max_urls]


def extract_links_from_html(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    out: list[str] = []
    for a in soup.find_all("a", href=True):
        href = str(a["href"]).strip()
        if not href or href.startswith(("#", "javascript:", "mailto:")):
            continue
        joined = urljoin(base_url, href)
        try:
            joined, _ = urldefrag(joined)
            out.append(joined)
        except Exception:
            continue
    return out


def fetch_robots_txt(host: str, scheme: str, *, timeout: float) -> str | None:
    base = f"{scheme}://{host}"
    robots_url = urljoin(base + "/", "robots.txt")
    try:
        robots_url = assert_public_http_url(robots_url)
        t = httpx.Timeout(timeout + 2.0, connect=min(10.0, timeout))
        with httpx.Client(timeout=t, follow_redirects=True) as client:
            r = client.get(robots_url)
            if r.status_code != 200:
                return None
            return r.text[:512_000]
    except Exception:
        return None


def can_fetch_url_robots(
    url: str, *, robots_body: str | None, user_agent: str
) -> bool:
    if not robots_body:
        return True
    rp = RobotFileParser()
    rp.parse(robots_body.splitlines())
    try:
        return rp.can_fetch(user_agent or "*", url)
    except Exception:
        return True


def apply_delay(delay_sec: float) -> None:
    if delay_sec > 0:
        time.sleep(delay_sec)
