"""Scraplus Python client."""

from __future__ import annotations

from typing import Any

import httpx


class Scraplus:
    """Synchronous Scraplus API client."""

    def __init__(self, api_key: str, base_url: str = "http://localhost:3000") -> None:
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=f"{self.base_url}/api/v1",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(60.0, connect=10.0),
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "Scraplus":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        resp = self._client.request(method, path, **kwargs)
        resp.raise_for_status()
        return resp.json()

    def scrape(self, url: str, **kwargs: Any) -> dict[str, Any]:
        return self._request("POST", "/scrape", json={"url": url, **kwargs})

    def batch(self, urls: list[str], **kwargs: Any) -> dict[str, Any]:
        return self._request("POST", "/batch", json={"urls": urls, **kwargs})

    def get_batch(self, batch_id: str) -> dict[str, Any]:
        return self._request("GET", f"/batch/{batch_id}")

    def crawl(self, url: str, **kwargs: Any) -> dict[str, Any]:
        return self._request("POST", "/crawl", json={"url": url, **kwargs})

    def get_crawl(self, crawl_id: str) -> dict[str, Any]:
        return self._request("GET", f"/crawl/{crawl_id}")

    def map(self, url: str, **kwargs: Any) -> dict[str, Any]:
        return self._request("POST", "/map", json={"url": url, **kwargs})

    def search(self, query: str, **kwargs: Any) -> dict[str, Any]:
        return self._request("POST", "/search", json={"query": query, **kwargs})

    def extract(self, url: str, selectors: dict[str, str], **kwargs: Any) -> dict[str, Any]:
        return self._request("POST", "/extract", json={"url": url, "selectors": selectors, **kwargs})

    def extract_llm(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        return self._request("POST", "/extract/llm", json={"prompt": prompt, **kwargs})

    def interact(self, url: str, actions: list[dict[str, Any]], **kwargs: Any) -> dict[str, Any]:
        return self._request("POST", "/interact", json={"url": url, "actions": actions, **kwargs})

    def get_usage(self) -> dict[str, Any]:
        return self._request("GET", "/usage")
