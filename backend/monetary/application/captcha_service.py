"""Bot protection for the public forms (sign-up, forgot password, and sign-in after repeated failures).

Two providers, chosen by `MONETARY_CAPTCHA_PROVIDER`: a built-in proof of work (default, no third party)
or Cloudflare Turnstile. `none` turns it off. A solved proof of work is accepted once: its salt is
remembered until it would have expired anyway.
"""

from __future__ import annotations

import threading
import time

from monetary import config
from monetary.domain import captcha as pow_captcha
from monetary.domain.exceptions import CaptchaRequired
from monetary.infrastructure import turnstile

_used: dict[str, float] = {}
_used_lock = threading.Lock()


def public_config(secret: bytes) -> dict:
    """What the web app needs to show the right challenge."""
    provider = config.captcha_provider()
    if provider == "altcha":
        challenge = pow_captcha.create_challenge(
            secret, max_number=config.captcha_difficulty(), ttl_seconds=config.captcha_ttl_seconds(),
            now=time.time())
        return {"provider": provider, "challenge": challenge, "site_key": None}
    if provider == "turnstile":
        return {"provider": provider, "challenge": None, "site_key": config.turnstile_site_key()}
    return {"provider": "none", "challenge": None, "site_key": None}


def _remember(salt: str, now: float) -> bool:
    """Record a salt as spent. False when it was already used."""
    with _used_lock:
        for key in [k for k, until in _used.items() if until < now]:
            del _used[key]
        if salt in _used:
            return False
        _used[salt] = now + config.captcha_ttl_seconds()
        return True


def require(token: str | None, secret: bytes, *, remote_ip: str | None = None) -> None:
    """Pass silently when the captcha is off or solved; raise CaptchaRequired otherwise."""
    provider = config.captcha_provider()
    if provider == "none":
        return
    if not token:
        raise CaptchaRequired("Please complete the captcha and try again.")
    if provider == "altcha":
        now = time.time()
        salt = pow_captcha.verify_solution(token, secret, now=now)
        if salt is None or not _remember(salt, now):
            raise CaptchaRequired("The captcha was not accepted. Please try again.")
        return
    if not config.turnstile_secret() or not turnstile.verify(
            token, secret=config.turnstile_secret(), remote_ip=remote_ip):
        raise CaptchaRequired("The captcha was not accepted. Please try again.")
