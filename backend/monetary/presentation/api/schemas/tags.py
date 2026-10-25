from __future__ import annotations

from pydantic import Field

from monetary.presentation.api.schemas.common import ApiModel


class TagOut(ApiModel):
    id: int
    name: str
    uses: int = Field(description="Live (posted) transactions carrying the tag")


class TagRename(ApiModel):
    name: str = Field(min_length=1, max_length=60, description="Renaming onto an existing tag merges the two")


class TagCreate(ApiModel):
    name: str = Field(min_length=1, max_length=60, description="Normalised like every tag name; 409 if it exists")
