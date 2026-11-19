"""Cloudflare Turnstile verification (the optional alternative to the built-in proof of work)."""

from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request

logger = logging.getLogger("monetary.captcha")
VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify(token: str, *, secret: str, remote_ip: str | None, timeout: float = 5.0) -> bool:
    """True when Cloudflare accepts the token. A network failure counts as "not verified": failing
    closed is what keeps bots out, and it is logged so an operator can see why people are blocked."""
    fields = {"secret": secret, "response": token}
    if remote_ip:
        fields["remoteip"] = remote_ip
    request = urllib.request.Request(VERIFY_URL, data=urllib.parse.urlencode(fields).encode("utf-8"))
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (fixed https URL)
            return bool(json.loads(response.read()).get("success"))
    except Exception:  # noqa: BLE001 - any failure means "could not verify"
        logger.warning("Turnstile verification failed", exc_info=True)
        return False
