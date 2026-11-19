"""A small in-memory, fixed-window rate limiter for sensitive unauthenticated
endpoints (login, password reset). This is intentionally simple: it protects a
single-process deployment against casual credential-stuffing / brute-force
attempts without adding an external dependency (Redis, etc).

Production note: because state lives in process memory, it resets on restart
and is NOT shared across multiple worker processes/instances. A multi-instance
deployment should enforce rate limiting at the edge (reverse proxy / API
gateway / Redis-backed limiter) in addition to, or instead of, this.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from monetary.domain.exceptions import RateLimitError


class FixedWindowRateLimiter:
    def __init__(self, *, max_attempts: int, window_seconds: float):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Raises RateLimitError if `key` has exceeded max_attempts within the
        current window; otherwise records this attempt."""
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            cutoff = now - self.window_seconds
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_attempts:
                raise RateLimitError(
                    "Too many attempts. Please wait a bit before trying again."
                )
            bucket.append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


class FailureCounter:
    """Counts recent failures per key (a client address) inside a sliding window, so a form can ask for
    a captcha once someone has failed a few times. Same single-process caveat as the limiter above."""

    def __init__(self, *, window_seconds: float):
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _trim(self, bucket: deque, now: float) -> None:
        cutoff = now - self.window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()

    def record(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            self._trim(bucket, now)
            bucket.append(now)

    def count(self, key: str) -> int:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits.get(key)
            if bucket is None:
                return 0
            self._trim(bucket, now)
            return len(bucket)

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


# Shared limiters for the auth flows most worth protecting. Keyed by client IP
# by the caller (see presentation/api/deps.py::enforce_auth_rate_limit).
login_rate_limiter = FixedWindowRateLimiter(max_attempts=10, window_seconds=5 * 60)
password_reset_rate_limiter = FixedWindowRateLimiter(max_attempts=10, window_seconds=15 * 60)
# Self-registration is open to anyone, so it is limited per client address: 5 sign-ups per hour.
register_rate_limiter = FixedWindowRateLimiter(max_attempts=5, window_seconds=60 * 60)

# Wrong passwords from one address in the last 15 minutes; past a few, the sign-in form needs a captcha.
login_failure_counter = FailureCounter(window_seconds=15 * 60)
# Challenges are cheap to issue but still not free; this only stops a script from hammering the endpoint.
captcha_rate_limiter = FixedWindowRateLimiter(max_attempts=60, window_seconds=5 * 60)
