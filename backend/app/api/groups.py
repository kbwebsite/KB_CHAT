from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import success_response
from app.api.conversations import conversation_to_dict
from app.services.errors import service_route
from app.services import groups as group_service

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.post("")
@service_route
def create_group(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # payload: {title, description, member_ids, member_usernames}
    conv, skipped = group_service.create_group(
        db,
        creator_id=current_user.id,
        title=payload.get("title"),
        description=payload.get("description"),
        member_ids=payload.get("member_ids"),
        member_usernames=payload.get("member_usernames"),
    )
    msg = "Group created"
    if skipped:
        msg += f" ({', '.join(skipped[:3])} blocked by group privacy)"
    return success_response(conversation_to_dict(db, conv, current_user.id), msg)


@router.patch("/{group_id}")
@service_route
def update_group(
    group_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    M = group_service.MISSING
    conv = group_service.update_group_details(
        db,
        conv_id=group_id,
        actor_id=current_user.id,
        title=payload.get("title") if payload.get("title") else M,
        description=payload.get("description") if "description" in payload else M,
        avatar_url=payload.get("avatar_url") if "avatar_url" in payload else M,
        only_admins_can_send=payload.get("only_admins_can_send")
        if "only_admins_can_send" in payload
        else M,
    )
    return success_response(
        conversation_to_dict(db, conv, current_user.id), "Group updated"
    )


@router.post("/{group_id}/members")
@service_route
def add_members(
    group_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv, added, skipped = group_service.add_group_members(
        db,
        conv_id=group_id,
        actor_id=current_user.id,
        user_ids=payload.get("user_ids"),
        usernames=payload.get("usernames"),
    )
    msg = f"Added {added} members"
    if skipped:
        msg += f" ({', '.join(skipped[:3])} blocked by group privacy)"
    return success_response(conversation_to_dict(db, conv, current_user.id), msg)


@router.delete("/{group_id}/members/{user_id}")
@service_route
def remove_member(
    group_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv, message = group_service.remove_group_member(
        db,
        conv_id=group_id,
        actor_id=current_user.id,
        target_user_id=user_id,
        allow_self_leave=True,
    )
    if conv is None:
        return success_response(None, message)
    return success_response(conversation_to_dict(db, conv, current_user.id), message)


@router.get("/{group_id}/invite")
@service_route
def get_invite(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner/admin only: read the current invite token (null = disabled)."""
    token = group_service.get_invite_token(
        db, group_id=group_id, actor_id=current_user.id
    )
    return success_response({"invite_token": token})


@router.post("/{group_id}/invite")
@service_route
def create_invite(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner/admin only: (re)generate the invite link token, invalidating any
    previous link."""
    token = group_service.rotate_invite_token(
        db, group_id=group_id, actor_id=current_user.id
    )
    return success_response({"invite_token": token}, "Invite link ready")


@router.delete("/{group_id}/invite")
@service_route
def disable_invite(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner/admin only: disable the invite link."""
    group_service.disable_invite_token(db, group_id=group_id, actor_id=current_user.id)
    return success_response(None, "Invite link disabled")


@router.post("/join/{token}")
@service_route
def join_by_invite(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Join a group through an invite link. Idempotent for members."""
    conversation_id, already_member = group_service.join_group_by_token(
        db, token=token, user_id=current_user.id
    )
    if already_member:
        return success_response(
            {"conversation_id": conversation_id, "already_member": True},
            "Already a member",
        )
    return success_response(
        {"conversation_id": conversation_id, "already_member": False}, "Joined group"
    )


@router.post("/{group_id}/transfer")
@service_route
def transfer_ownership(
    group_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner hands ownership to another member (old owner becomes admin)."""
    target_id = payload.get("user_id")
    try:
        target_id = int(target_id) if target_id is not None else None
    except (TypeError, ValueError):
        target_id = None
    if not target_id:
        from app.services.errors import bad_request as _bad

        raise _bad("user_id required")
    conv = group_service.transfer_ownership(
        db,
        conv_id=group_id,
        actor_id=current_user.id,
        target_user_id=target_id,
    )
    return success_response(
        conversation_to_dict(db, conv, current_user.id),
        "Ownership transferred",
    )
