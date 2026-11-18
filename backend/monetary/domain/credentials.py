"""Validation of the credentials people type in: email, password, security question."""

from __future__ import annotations

from monetary.domain.exceptions import ValidationError
from monetary.domain.security import MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, SECURITY_QUESTIONS


def validate_email(email: str) -> str:
    """Trim and lower-case an email; reject obviously malformed values."""
    email = (email or "").strip()
    if not email or "@" not in email or email.startswith("@") or email.endswith("@"):
        raise ValidationError(f"Invalid email: {email!r}")
    return email.lower()


def validate_password(password: str) -> str:
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValidationError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters.")
    return password


def validate_security_question(question_id: int, answer: str) -> str:
    if question_id not in SECURITY_QUESTIONS:
        valid = ", ".join(str(k) for k in SECURITY_QUESTIONS)
        raise ValidationError(f"Invalid security_question_id {question_id!r}; must be one of: {valid}.")
    if not answer or not answer.strip():
        raise ValidationError("A security answer is required.")
    return answer


def validate_currency(code: str) -> str:
    currency = (code or "").strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        raise ValidationError(f"Invalid currency code {code!r}; expected e.g. 'INR'.")
    return currency
