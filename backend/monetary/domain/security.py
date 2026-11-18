"""Authentication primitives: password hashing (bcrypt), security-question
answer hashing (also bcrypt, after normalization), and opaque session tokens
(random, SHA-256-hashed at rest -- same pattern as before, just now issued at
login instead of once at setup).
"""

from __future__ import annotations

import hashlib
import secrets

import bcrypt

SESSION_TOKEN_PREFIX = "ets_"  # "expense tracker session"
SESSION_TTL_HOURS = 24 * 7  # one week
SUPERUSER_SESSION_TTL_HOURS = 24  # administrators sign in again every day

# Fixed list of security questions -- a signup/reset UI renders these by id.
SECURITY_QUESTIONS: dict[int, str] = {
    1: "What was the name of your first pet?",
    2: "What is your mother's maiden name?",
    3: "What was the name of your first school?",
    4: "What city were you born in?",
    5: "What was your childhood nickname?",
}

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128  # bcrypt silently truncates at 72 bytes; cap input so
                           # callers get a clear error instead of a confusing
                           # "your password changed but only the first 72 bytes mattered"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _normalize_answer(answer: str) -> str:
    return answer.strip().lower()


def hash_security_answer(answer: str) -> str:
    return bcrypt.hashpw(_normalize_answer(answer).encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_security_answer(answer: str, answer_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_normalize_answer(answer).encode("utf-8"), answer_hash.encode("utf-8"))
    except ValueError:
        return False


def generate_session_token() -> str:
    return SESSION_TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_session_token(plaintext_token: str) -> str:
    return hashlib.sha256(plaintext_token.encode("utf-8")).hexdigest()


TEMP_PASSWORD_LENGTH = 16
# No look-alike characters (0/O, 1/l/I) so a temporary password can be read out or retyped reliably.
_TEMP_PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # pragma: allowlist secret


def generate_temporary_password() -> str:
    """A random one-time password for an account a superuser created or reset."""
    return "".join(secrets.choice(_TEMP_PASSWORD_ALPHABET) for _ in range(TEMP_PASSWORD_LENGTH))
