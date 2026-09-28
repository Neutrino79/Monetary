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

from duevia.domain.exceptions import RateLimitError


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


# Shared limiters for the auth flows most worth protecting. Keyed by client IP
# by the caller (see presentation/api/deps.py::enforce_auth_rate_limit).
login_rate_limiter = FixedWindowRateLimiter(max_attempts=10, window_seconds=5 * 60)
password_reset_rate_limiter = FixedWindowRateLimiter(max_attempts=10, window_seconds=15 * 60)
