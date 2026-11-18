"""Domain-level exceptions — the only ones the presentation layer needs to render."""


class DomainError(Exception):
    """Base class for all expected/handled domain and application errors."""


class NotFoundError(DomainError):
    """A referenced entity does not exist."""


class ValidationError(DomainError):
    """An input violates a domain invariant."""


class AuthenticationError(DomainError):
    """Credentials were missing or wrong (rendered as HTTP 401)."""


class OwnershipError(DomainError):
    """A referenced entity does not belong to the single application owner."""


class ConflictError(DomainError):
    """The requested operation conflicts with current state."""


class RateLimitError(DomainError):
    """Too many requests for a rate-limited operation (e.g. login attempts)."""


class PermissionDeniedError(DomainError):
    """The caller is authenticated but not allowed to do this (rendered as HTTP 403)."""


class AccountStateError(PermissionDeniedError):
    """The account exists and the password was right, but its state does not allow signing in."""


class AccountPendingApproval(AccountStateError):
    """Self-registered account that no superuser has approved yet."""


class AccountRejected(AccountStateError):
    """The registration request was declined."""


class AccountSuspended(AccountStateError):
    """A superuser suspended the account."""


class AccountPendingDelete(AccountStateError):
    """The account is scheduled for deletion."""


class PasswordChangeRequired(PermissionDeniedError):
    """A temporary password must be replaced before anything else can be done."""


class NoLedgerError(PermissionDeniedError):
    """The account has no ledger (an admin-only account)."""
