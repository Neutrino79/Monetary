"""Domain-level exceptions — the only ones the presentation layer needs to render."""


class DomainError(Exception):
    """Base class for all expected/handled domain and application errors."""


class NotFoundError(DomainError):
    """A referenced entity does not exist."""


class ValidationError(DomainError):
    """An input violates a domain invariant."""


class OwnershipError(DomainError):
    """A referenced entity does not belong to the single application owner."""


class ConflictError(DomainError):
    """The requested operation conflicts with current state."""


class RateLimitError(DomainError):
    """Too many requests for a rate-limited operation (e.g. login attempts)."""
