from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from monetary.application import tag_service
from monetary.config import API_PREFIX
from monetary.presentation.api.deps import get_current_owner, DB
from monetary.presentation.api.schemas.common import MessageOut
from monetary.presentation.api.schemas.tags import TagCreate, TagOut, TagRename

router = APIRouter(prefix=f"{API_PREFIX}/tags", tags=["tags"])


@router.get("", response_model=list[TagOut])
def list_tags(conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner)):
    """Every tag, alphabetical, with its use count (for the pickers and the tag manager)."""
    return [TagOut(**t) for t in tag_service.list_tags(conn)]


@router.post("", response_model=TagOut, status_code=201)
def create_tag(payload: TagCreate, conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner)):
    """Tags are created here, then picked on transactions (an unknown tag name is rejected there)."""
    return TagOut(**tag_service.create(conn, payload.name))


@router.patch("/{tag_id}", response_model=TagOut)
def rename_tag(tag_id: int, payload: TagRename, conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner)):
    return TagOut(**tag_service.rename(conn, tag_id, payload.name))


@router.delete("/{tag_id}", response_model=MessageOut)
def delete_tag(tag_id: int, conn: sqlite3.Connection = DB, owner: dict = Depends(get_current_owner)):
    """Removes the tag from every transaction; the transactions themselves are untouched."""
    tag_service.delete(conn, tag_id)
    return MessageOut(detail=f"Tag {tag_id} deleted.")
