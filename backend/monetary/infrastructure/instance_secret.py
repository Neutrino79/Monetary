"""The server's own secret, used to sign captcha challenges and to make decoy answers stable.

It is not a password or a user's data: losing it only invalidates challenges that are a few minutes old.
`MONETARY_SECRET_KEY` wins when set; otherwise a random key is created once in the data directory
(owner-only permissions) and reused, so every worker process agrees on it.
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path

from monetary.config import secret_key_from_environment

SECRET_FILENAME = "instance.key"  # pragma: allowlist secret
_cache: dict[str, bytes] = {}


def load_secret(data_dir: str | Path) -> bytes:
    configured = secret_key_from_environment()
    if configured:
        return configured.encode("utf-8")
    path = Path(data_dir) / SECRET_FILENAME
    key = str(path)
    if key in _cache:
        return _cache[key]
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        # O_EXCL: two workers starting together cannot each write a different key.
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "w") as handle:
                handle.write(secrets.token_hex(32))
    value = path.read_text().strip().encode("utf-8")
    _cache[key] = value
    return value
