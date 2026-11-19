"""The built-in proof-of-work challenge: what makes a solution valid, and what must be refused."""
import base64
import hashlib
import json

from monetary.domain import captcha

SECRET = b"unit-test-secret"
NOW = 1_800_000_000.0


def _solve(ch: dict) -> int:
    for n in range(ch["maxnumber"] + 1):
        if hashlib.sha256(f"{ch['salt']}{n}".encode()).hexdigest() == ch["challenge"]:
            return n
    raise AssertionError("no solution")


def _payload(ch: dict, number: int, **over) -> str:
    body = {"algorithm": ch["algorithm"], "challenge": ch["challenge"], "number": number, "salt": ch["salt"],
            "signature": ch["signature"], **over}
    return base64.b64encode(json.dumps(body).encode()).decode()


def test_a_solved_challenge_verifies_and_returns_its_salt():
    ch = captcha.create_challenge(SECRET, max_number=200, ttl_seconds=60, now=NOW)
    assert captcha.verify_solution(_payload(ch, _solve(ch)), SECRET, now=NOW + 5) == ch["salt"]


def test_a_wrong_number_an_expired_challenge_or_another_secret_is_refused():
    ch = captcha.create_challenge(SECRET, max_number=200, ttl_seconds=60, now=NOW)
    good = _solve(ch)
    assert captcha.verify_solution(_payload(ch, good + 1), SECRET, now=NOW) is None
    assert captcha.verify_solution(_payload(ch, good), SECRET, now=NOW + 61) is None
    assert captcha.verify_solution(_payload(ch, good), b"someone-else", now=NOW) is None


def test_tampering_with_the_salt_or_the_algorithm_is_refused():
    ch = captcha.create_challenge(SECRET, max_number=200, ttl_seconds=60, now=NOW)
    good = _solve(ch)
    far_future = ch["salt"].rsplit("=", 1)[0] + "=" + str(int(NOW) + 10**6)
    assert captcha.verify_solution(_payload(ch, good, salt=far_future), SECRET, now=NOW) is None
    assert captcha.verify_solution(_payload(ch, good, algorithm="MD5"), SECRET, now=NOW) is None


def test_garbage_is_refused_without_raising():
    for junk in ("", "not base64!", base64.b64encode(b"{}").decode(), base64.b64encode(b"[1]").decode()):
        assert captcha.verify_solution(junk, SECRET, now=NOW) is None


def test_the_decoy_question_is_stable_in_range_and_depends_on_the_secret():
    a = captcha.decoy_question_id("Ghost@Example.com", SECRET, 5)
    assert a == captcha.decoy_question_id("ghost@example.com ", SECRET, 5) and 1 <= a <= 5
    seen = {captcha.decoy_question_id(f"user{i}@example.com", SECRET, 5) for i in range(60)}
    assert seen == {1, 2, 3, 4, 5}
