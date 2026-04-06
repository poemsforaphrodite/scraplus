"""SSRF guards aligned with Next.js src/lib/scrape/ssrf.ts (defense in depth on Modal)."""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "0.0.0.0",
        "metadata.google.internal",
        "metadata.goog",
    }
)

BLOCKED_SUFFIXES = (".localhost", ".local", ".internal")

PRIVATE_IPV4 = re.compile(
    r"^(127\.|10\.|"
    r"172\.(1[6-9]|2\d|3[0-1])\.|"
    r"192\.168\.|"
    r"169\.254\.|"
    r"100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)"
)


class SsrfError(ValueError):
    pass


def assert_public_http_url(raw: str) -> str:
    if not raw or not isinstance(raw, str):
        raise SsrfError("Invalid URL")

    raw = raw.strip()
    try:
        parsed = urlparse(raw)
    except Exception as e:
        raise SsrfError("Invalid URL") from e

    if parsed.username or parsed.password:
        raise SsrfError("URLs with credentials are not allowed")

    if parsed.scheme not in ("http", "https"):
        raise SsrfError("Only http and https URLs are allowed")

    host = (parsed.hostname or "").lower()

    if host in ("[::1]", "0000:0000:0000:0000:0000:0000:0000:0001"):
        raise SsrfError("Private hosts are not allowed")

    if host in BLOCKED_HOSTNAMES:
        raise SsrfError("Host is blocked")

    if any(host.endswith(s) for s in BLOCKED_SUFFIXES):
        raise SsrfError("Host suffix is not allowed")

    if PRIVATE_IPV4.match(host):
        raise SsrfError("Private IP addresses are not allowed")

    # Block literal IPv4/IPv6 that resolve to non-public space
    try:
        if host.startswith("[") and host.endswith("]"):
            ip = ipaddress.ip_address(host[1:-1])
        elif re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", host):
            ip = ipaddress.ip_address(host)
        elif ":" in host and not host.startswith("["):
            ip = ipaddress.ip_address(host)
        else:
            return raw
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
        ):
            raise SsrfError("Private IP addresses are not allowed")
    except ValueError:
        return raw

    return raw
