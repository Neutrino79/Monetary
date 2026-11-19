from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query, Request

from monetary.application import admin_service
from monetary.config import API_PREFIX, data_dir_from_environment
from monetary.presentation.api.deps import CONTROL, _client_key, get_superuser
from monetary.presentation.api.schemas.admin import (
    AdminCreatedUserOut,
    AdminCreateUserRequest,
    AdminStatsOut,
    AdminUserOut,
    AuditEntryOut,
    ReasonRequest,
    RoleRequest,
)
from monetary.presentation.api.schemas.common import MessageOut, Page

router = APIRouter(prefix=f"{API_PREFIX}/admin", tags=["admin"], dependencies=[Depends(get_superuser)])


@router.get("/stats", response_model=AdminStatsOut)
def stats(control: sqlite3.Connection = CONTROL):
    return AdminStatsOut(**admin_service.stats(control, data_dir_from_environment()))


@router.get("/users", response_model=Page[AdminUserOut])
def list_users(
    status: str | None = None, q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
    control: sqlite3.Connection = CONTROL,
):
    items, total = admin_service.list_users(control, status=status, q=q, limit=limit, offset=offset)
    return Page(items=[AdminUserOut(**u) for u in items], total=total, limit=limit, offset=offset)


@router.post("/users", response_model=AdminCreatedUserOut, status_code=201)
def create_user(payload: AdminCreateUserRequest, request: Request, control: sqlite3.Connection = CONTROL,
                actor: dict = Depends(get_superuser)):
    """Create an active account with a generated temporary password (returned once) and an empty
    ledger. The user must choose a new password at first sign-in."""
    user, temp = admin_service.create_user(
        control, data_dir_from_environment(), actor, name=payload.name, email=payload.email,
        timezone=payload.timezone, home_currency_code=payload.currency, role=payload.role,
        ip=_client_key(request))
    return AdminCreatedUserOut(user=AdminUserOut(**user), temporary_password=temp)


@router.get("/users/{user_id}", response_model=AdminUserOut)
def get_user(user_id: int, control: sqlite3.Connection = CONTROL):
    return AdminUserOut(**admin_service.get_user(control, user_id))


@router.post("/users/{user_id}/approve", response_model=AdminUserOut)
def approve(user_id: int, request: Request, control: sqlite3.Connection = CONTROL,
            actor: dict = Depends(get_superuser)):
    return AdminUserOut(**admin_service.approve(
        control, data_dir_from_environment(), actor, user_id, ip=_client_key(request)))


@router.post("/users/{user_id}/reject", response_model=AdminUserOut)
def reject(user_id: int, request: Request, payload: ReasonRequest | None = None,
           control: sqlite3.Connection = CONTROL, actor: dict = Depends(get_superuser)):
    return AdminUserOut(**admin_service.reject(
        control, actor, user_id, reason=payload.reason if payload else None, ip=_client_key(request)))


@router.post("/users/{user_id}/suspend", response_model=AdminUserOut)
def suspend(user_id: int, request: Request, payload: ReasonRequest | None = None,
            control: sqlite3.Connection = CONTROL, actor: dict = Depends(get_superuser)):
    return AdminUserOut(**admin_service.suspend(
        control, actor, user_id, reason=payload.reason if payload else None, ip=_client_key(request)))


@router.post("/users/{user_id}/reactivate", response_model=AdminUserOut)
def reactivate(user_id: int, request: Request, control: sqlite3.Connection = CONTROL,
               actor: dict = Depends(get_superuser)):
    return AdminUserOut(**admin_service.reactivate(control, actor, user_id, ip=_client_key(request)))


@router.post("/users/{user_id}/unlock", response_model=AdminUserOut)
def unlock(user_id: int, request: Request, control: sqlite3.Connection = CONTROL,
           actor: dict = Depends(get_superuser)):
    """Lift a sign-in lock (too many wrong passwords) immediately."""
    return AdminUserOut(**admin_service.unlock(control, actor, user_id, ip=_client_key(request)))


@router.post("/users/{user_id}/reopen", response_model=AdminUserOut)
def reopen(user_id: int, request: Request, control: sqlite3.Connection = CONTROL,
           actor: dict = Depends(get_superuser)):
    """Put a rejected request back to pending, with a fresh allowance of re-requests."""
    return AdminUserOut(**admin_service.reopen(control, actor, user_id, ip=_client_key(request)))


@router.post("/users/{user_id}/reset-password", response_model=AdminCreatedUserOut)
def reset_password(user_id: int, request: Request, control: sqlite3.Connection = CONTROL,
                   actor: dict = Depends(get_superuser)):
    """New temporary password (returned once); the user is signed out everywhere."""
    user, temp = admin_service.reset_password(control, actor, user_id, ip=_client_key(request))
    return AdminCreatedUserOut(user=AdminUserOut(**user), temporary_password=temp)


@router.post("/users/{user_id}/revoke-sessions", response_model=MessageOut)
def revoke_sessions(user_id: int, request: Request, control: sqlite3.Connection = CONTROL,
                    actor: dict = Depends(get_superuser)):
    admin_service.revoke_sessions(control, actor, user_id, ip=_client_key(request))
    return MessageOut(detail="All sessions revoked.")


@router.post("/users/{user_id}/delete", response_model=AdminUserOut)
def delete_user(user_id: int, request: Request, control: sqlite3.Connection = CONTROL,
                actor: dict = Depends(get_superuser)):
    """Locks the account and schedules its data for removal after a 30-day grace period."""
    return AdminUserOut(**admin_service.delete(control, actor, user_id, ip=_client_key(request)))


@router.post("/users/{user_id}/restore", response_model=AdminUserOut)
def restore_user(user_id: int, request: Request, control: sqlite3.Connection = CONTROL,
                 actor: dict = Depends(get_superuser)):
    return AdminUserOut(**admin_service.restore(control, actor, user_id, ip=_client_key(request)))


@router.put("/users/{user_id}/role", response_model=AdminUserOut)
def set_role(user_id: int, payload: RoleRequest, request: Request, control: sqlite3.Connection = CONTROL,
             actor: dict = Depends(get_superuser)):
    return AdminUserOut(**admin_service.set_role(control, actor, user_id, payload.role, ip=_client_key(request)))


@router.get("/audit-log", response_model=Page[AuditEntryOut])
def audit_log(
    user_id: int | None = None, limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0), control: sqlite3.Connection = CONTROL,
):
    items, total = admin_service.audit_log(control, limit=limit, offset=offset, target_user_id=user_id)
    return Page(items=[AuditEntryOut(**a) for a in items], total=total, limit=limit, offset=offset)
