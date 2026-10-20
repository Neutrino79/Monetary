from types import SimpleNamespace

import pytest

from monetary.domain.exceptions import RateLimitError
from monetary.infrastructure import rate_limiter as rl


@pytest.fixture()
def clock(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(rl, "time", SimpleNamespace(monotonic=lambda: now[0]))
    return now


def test_allows_up_to_max_then_blocks(clock):
    lim = rl.FixedWindowRateLimiter(max_attempts=3, window_seconds=60)
    for _ in range(3):
        lim.check("ip")
    with pytest.raises(RateLimitError):
        lim.check("ip")


def test_window_expiry_frees_capacity(clock):
    lim = rl.FixedWindowRateLimiter(max_attempts=2, window_seconds=60)
    lim.check("ip"); lim.check("ip")
    with pytest.raises(RateLimitError):
        lim.check("ip")
    clock[0] += 61
    lim.check("ip")


def test_keys_are_independent(clock):
    lim = rl.FixedWindowRateLimiter(max_attempts=1, window_seconds=60)
    lim.check("a")
    lim.check("b")
    with pytest.raises(RateLimitError):
        lim.check("a")


def test_blocked_attempts_do_not_extend_the_block(clock):
    lim = rl.FixedWindowRateLimiter(max_attempts=1, window_seconds=60)
    lim.check("ip")
    for _ in range(5):
        clock[0] += 10
        with pytest.raises(RateLimitError):
            lim.check("ip")
    clock[0] += 11   # 61s after the only recorded hit
    lim.check("ip")


def test_reset(clock):
    lim = rl.FixedWindowRateLimiter(max_attempts=1, window_seconds=60)
    lim.check("ip"); lim.reset("ip"); lim.check("ip")
