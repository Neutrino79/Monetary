from __future__ import annotations

from fastapi import APIRouter

from duevia.config import API_PREFIX, API_VERSION, VERSION, app_name, app_tagline
from duevia.presentation.api.schemas.system import MetaOut

router = APIRouter(prefix=API_PREFIX, tags=["system"])


@router.get("/meta", response_model=MetaOut)
def meta():
    """Public application identity (name, tagline, version)."""
    return MetaOut(app_name=app_name(), tagline=app_tagline(), version=VERSION, api_version=API_VERSION)
