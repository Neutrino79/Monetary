from __future__ import annotations

from duevia.presentation.api.schemas.common import ApiModel


class MetaOut(ApiModel):
    """Public, unauthenticated application identity. The web app reads the
    product name from here so renaming it is a backend configuration change."""
    app_name: str
    tagline: str
    version: str
    api_version: str
