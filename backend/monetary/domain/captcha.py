"""Self-contained proof-of-work challenge (the ALTCHA scheme), so bots pay CPU time on sign-up and
password reset without any third-party service.

The server hands out `challenge = sha256(salt + secret_number)` plus an HMAC signature over it; the
client searches for the number, and the server only re-hashes once to check the answer. The salt
carries an expiry, so an old solution stops working. Pure functions: no I/O, no clock reads except
through the `now` argument.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from urllib.parse import parse_qs

ALGORITHM = "SHA-256"


def _sign(challenge: str, secret: bytes) -> str:
    return hmac.new(secret, challenge.encode("utf-8"), hashlib.sha256).hexdigest()


def create_challenge(secret: bytes, *, max_number: int, ttl_seconds: int, now: float) -> dict:
    expires = int(now) + ttl_seconds
    salt = f"{secrets.token_hex(12)}?expires={expires}"
    number = secrets.randbelow(max_number + 1)
    challenge = hashlib.sha256(f"{salt}{number}".encode("utf-8")).hexdigest()
    return {"algorithm": ALGORITHM, "challenge": challenge, "salt": salt, "maxnumber": max_number,
            "signature": _sign(challenge, secret)}


def verify_solution(payload: str, secret: bytes, *, now: float) -> str | None:
    """The salt of a valid, unexpired, correctly solved challenge (used once by the caller), else None."""
    try:
        data = json.loads(base64.b64decode(payload, validate=True))
        salt, challenge, signature = str(data["salt"]), str(data["challenge"]), str(data["signature"])
        number = int(data["number"])
    except (ValueError, KeyError, TypeError):
        return None
    if data.get("algorithm") != ALGORITHM or number < 0:
        return None
    if not hmac.compare_digest(signature, _sign(challenge, secret)):
        return None
    expires = parse_qs(salt.partition("?")[2]).get("expires", [""])[0]
    if not expires.isdigit() or int(expires) < now:
        return None
    if hashlib.sha256(f"{salt}{number}".encode("utf-8")).hexdigest() != challenge:
        return None
    return salt


def decoy_question_id(email: str, secret: bytes, count: int) -> int:
    """A stable 1..count question id for an email that has no real question, so "forgot password"
    looks identical for accounts that exist and ones that do not."""
    digest = hmac.new(secret, email.strip().lower().encode("utf-8"), hashlib.sha256).digest()
    return int.from_bytes(digest[:4], "big") % count + 1
