"""Optional OpenAI-compatible JSON extract (httpx, no SDK)."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

DEFAULT_MODEL = "gpt-4o-mini"
MAX_HTML_CHARS = 100_000


def truncate_html(html: str) -> str:
    h = re.sub(r"\s+", " ", html).strip()
    if len(h) <= MAX_HTML_CHARS:
        return h
    return h[: MAX_HTML_CHARS - 20] + "\n…[truncated]"


def llm_extract_sync(
    *,
    html: str | None,
    prompt: str,
    schema: dict[str, Any] | None,
    urls: list[str] | None,
) -> dict[str, Any]:
    api_key = (
        os.environ.get("SCRAPLUS_OPENAI_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or ""
    ).strip()
    if not api_key:
        raise ValueError("LLM extract requires SCRAPLUS_OPENAI_API_KEY or OPENAI_API_KEY")

    base = os.environ.get("SCRAPLUS_OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip(
        "/"
    )
    model = os.environ.get("SCRAPLUS_OPENAI_MODEL", DEFAULT_MODEL)

    system = (
        "You extract structured data from web content. "
        "Reply with a single JSON object only, no markdown fences."
    )
    user_parts: list[str] = []
    if urls:
        user_parts.append("URLs context:\n" + "\n".join(urls[:50]))
    if html:
        user_parts.append("Page HTML (possibly truncated):\n" + truncate_html(html))
    user_parts.append("Instructions:\n" + prompt)
    if schema:
        user_parts.append(
            "Target JSON shape (JSON Schema hints):\n"
            + json.dumps(schema, indent=2)[:8000]
        )
    user_msg = "\n\n".join(user_parts)

    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0.2,
    }
    if schema and os.environ.get("SCRAPLUS_LLM_JSON_MODE", "1") != "0":
        payload["response_format"] = {"type": "json_object"}

    with httpx.Client(
        timeout=httpx.Timeout(120.0, connect=15.0),
        headers={"Authorization": f"Bearer {api_key}"},
    ) as client:
        r = client.post(f"{base}/chat/completions", json=payload)
        r.raise_for_status()
        data = r.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise ValueError("Unexpected LLM response shape") from e
    content = str(content).strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    return json.loads(content)
