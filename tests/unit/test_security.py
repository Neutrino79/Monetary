from monetary.domain import security as sec


def test_password_roundtrip():
    h = sec.hash_password("s3cret-pass")
    assert h.startswith("$2") and h != "s3cret-pass"
    assert sec.verify_password("s3cret-pass", h)
    assert not sec.verify_password("S3cret-pass", h)


def test_hashes_are_salted():
    assert sec.hash_password("same-password") != sec.hash_password("same-password")


def test_verify_against_garbage_hash_is_false_not_error():
    assert sec.verify_password("x", "not-a-bcrypt-hash") is False
    assert sec.verify_security_answer("x", "") is False


def test_security_answer_is_normalized():
    h = sec.hash_security_answer("  Whiskers ")
    assert sec.verify_security_answer("whiskers", h)
    assert sec.verify_security_answer("WHISKERS  ", h)
    assert not sec.verify_security_answer("whisker", h)


def test_session_tokens():
    t1, t2 = sec.generate_session_token(), sec.generate_session_token()
    assert t1 != t2 and t1.startswith(sec.SESSION_TOKEN_PREFIX) and len(t1) > 40
    h = sec.hash_session_token(t1)
    assert h == sec.hash_session_token(t1) and len(h) == 64 and t1 not in h


def test_security_questions_are_the_documented_five():
    assert sorted(sec.SECURITY_QUESTIONS) == [1, 2, 3, 4, 5]
