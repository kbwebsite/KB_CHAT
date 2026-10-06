"""Wave 2B-1: persistent auth-session foundation (service-level tests).

Covers creation, hashing, rotation, reuse detection, revocation, expiry,
uniqueness, purge, and the sid-bearing access token. No route, frontend, or
WebSocket involvement. Secrets are never printed; only hashes are asserted.
"""

import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.auth.security import decode_token, hash_password
from app.database.connection import SessionLocal, create_tables, engine
from app.database.connection import Base
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services import auth_sessions as svc
from app.services.errors import ServiceError

create_tables()

T0 = datetime.now(timezone.utc)


def _user(suffix):
    db = SessionLocal()
    try:
        u = User(
            username=f"sesu{suffix}",
            email=f"sesu{suffix}@ex.com",
            display_name="Ses",
            hashed_password=hash_password("password123"),
            email_verified=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        return u.id
    finally:
        db.close()


def _uid():
    return f"{str(int(time.time() * 1000))[-6:]}{os.getpid() % 997}"


def test_migration_upgrade_and_downgrade():
    from sqlalchemy import inspect as _inspect

    create_tables()  # upgrade path used by boot: additive, checkfirst
    assert "auth_sessions" in _inspect(engine).get_table_names()
    cols = {c["name"] for c in _inspect(engine).get_columns("auth_sessions")}
    for expected in (
        "id",
        "user_id",
        "family_id",
        "refresh_hash",
        "status",
        "rotated_from_hash",
        "used_at",
        "revoked_at",
        "revoke_reason",
        "device_info",
        "browser_info",
        "ip_address",
        "created_at",
        "last_used_at",
        "expires_at",
    ):
        assert expected in cols, expected
    # downgrade path: drop, then prove upgrade recreates it (reversible)
    AuthSession.__table__.drop(engine, checkfirst=True)
    assert "auth_sessions" not in _inspect(engine).get_table_names()
    create_tables()
    assert "auth_sessions" in _inspect(engine).get_table_names()


def test_session_creation_defaults():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        row, token = svc.create_session(db, uid, now=T0)
        assert row.status == "active"
        assert row.family_id and row.id and row.id != row.family_id
        assert row.rotated_from_hash is None
        exp = row.expires_at.replace(tzinfo=timezone.utc)
        assert exp == T0 + timedelta(days=30)
        assert isinstance(token, str) and len(token) >= 43
    finally:
        db.close()


def test_refresh_hash_never_plaintext():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        row, token = svc.create_session(db, uid, now=T0)
        assert row.refresh_hash == hashlib.sha256(token.encode()).hexdigest()
        assert row.refresh_hash != token
        assert len(row.refresh_hash) == 64
        # plaintext appears nowhere in the persisted row
        values = [
            getattr(row, c.name)
            for c in AuthSession.__table__.columns
            if isinstance(getattr(row, c.name, None), str)
        ]
        assert token not in values
    finally:
        db.close()


def test_rotation_marks_old_used_and_keeps_family():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        row, t0 = svc.create_session(db, uid, now=T0)
        row2, t1 = svc.refresh_session(db, t0, now=T0)
        assert t1 != t0
        assert row2.family_id == row.family_id
        assert row2.id != row.id
        assert row2.rotated_from_hash == hashlib.sha256(t0.encode()).hexdigest()
        db.refresh(row)
        assert row.status == "used"
        assert row2.status == "active"
    finally:
        db.close()


def test_old_token_invalid_after_grace_and_family_revoked():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        row, t0 = svc.create_session(db, uid, now=T0)
        row2, t1 = svc.refresh_session(db, t0, now=T0)
        late = T0 + timedelta(seconds=120)
        with pytest.raises(ServiceError) as e:
            svc.refresh_session(db, t0, now=late)
        assert e.value.status_code == 401
        db.refresh(row)
        db.refresh(row2)
        assert row.status == "revoked" and row2.status == "revoked"
        assert row2.revoke_reason == "reuse"
        # successor is dead too (fail-closed)
        with pytest.raises(ServiceError):
            svc.refresh_session(db, t1, now=late)
    finally:
        db.close()


def test_in_grace_reuse_rotates_again_and_converges():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        _, t0 = svc.create_session(db, uid, now=T0)
        _, t1 = svc.refresh_session(db, t0, now=T0)
        _, t2 = svc.refresh_session(db, t0, now=T0 + timedelta(seconds=5))
        assert t2 not in (t0, t1)
        # intermediate successor superseded; newest works
        with pytest.raises(ServiceError):
            svc.refresh_session(db, t1, now=T0 + timedelta(seconds=200))
        db2 = SessionLocal()
        try:
            ok, _ = svc.refresh_session(db2, t2, now=T0 + timedelta(seconds=6))
            assert ok.status == "active"
        finally:
            db2.close()
    finally:
        db.close()


def test_expired_session_cannot_refresh():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        _, t0 = svc.create_session(db, uid, now=T0, ttl_days=0)
        with pytest.raises(ServiceError) as e:
            svc.refresh_session(db, t0, now=T0 + timedelta(seconds=1))
        assert e.value.status_code == 401 and "expired" in e.value.detail
    finally:
        db.close()


def test_explicit_revoke_and_sibling_untouched():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        r1, t1 = svc.create_session(db, uid, now=T0)
        _, t2 = svc.create_session(db, uid, now=T0)
        svc.revoke_session(db, r1.id, reason="logout", now=T0)
        with pytest.raises(ServiceError):
            svc.refresh_session(db, t1, now=T0)
        ok, _ = svc.refresh_session(db, t2, now=T0)
        assert ok.status == "active"
        assert svc.is_session_active(db, r1.id, now=T0) is False
    finally:
        db.close()


def test_revoke_unknown_sid_404():
    db = SessionLocal()
    try:
        with pytest.raises(ServiceError) as e:
            svc.revoke_session(db, "00000000-0000-0000-0000-000000000000")
        assert e.value.status_code == 404
    finally:
        db.close()


def test_family_revoke_scoped_to_family():
    u1, u2 = _user(_uid() + "a"), _user(_uid() + "b")
    db = SessionLocal()
    try:
        r1, _ = svc.create_session(db, u1, now=T0)
        _, other = svc.create_session(db, u2, now=T0)
        n = svc.revoke_family(db, r1.family_id, reason="reuse", now=T0)
        assert n == 1
        ok, _ = svc.refresh_session(db, other, now=T0)
        assert ok.status == "active"
    finally:
        db.close()


def test_unknown_token_no_side_effects():
    db = SessionLocal()
    try:
        before = db.query(AuthSession).count()
        with pytest.raises(ServiceError) as e:
            svc.refresh_session(db, "definitely-not-a-token", now=T0)
        assert e.value.status_code == 401
        assert db.query(AuthSession).count() == before
    finally:
        db.close()


def test_inactive_user_cannot_refresh():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        _, t0 = svc.create_session(db, uid, now=T0)
        u = db.query(User).filter_by(id=uid).first()
        u.is_active = False
        db.commit()
        with pytest.raises(ServiceError) as e:
            svc.refresh_session(db, t0, now=T0)
        assert e.value.status_code == 401
    finally:
        db.close()


def test_refresh_hash_unique_constraint():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        row, _ = svc.create_session(db, uid, now=T0)
        dup = AuthSession(
            id="11111111-1111-1111-1111-111111111111",
            user_id=uid,
            family_id="22222222-2222-2222-2222-222222222222",
            refresh_hash=row.refresh_hash,
            status="active",
            expires_at=T0 + timedelta(days=30),
        )
        db.add(dup)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
    finally:
        db.close()


def test_revoke_user_sessions_keep_current():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        keep, t_keep = svc.create_session(db, uid, now=T0)
        other, _ = svc.create_session(db, uid, now=T0)
        n = svc.revoke_user_sessions(
            db, uid, except_sid=keep.id, reason="password-change", now=T0
        )
        assert n == 1
        ok, _ = svc.refresh_session(db, t_keep, now=T0)
        assert ok.status == "active"
        db.refresh(other)
        assert other.revoke_reason == "password-change"
    finally:
        db.close()


def test_purge_only_old_non_active():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        old = T0 - timedelta(days=400)
        stale = AuthSession(
            id="33333333-3333-3333-3333-333333333333",
            user_id=uid,
            family_id="44444444-4444-4444-4444-444444444444",
            refresh_hash=hashlib.sha256(b"stale").hexdigest(),
            status="revoked",
            revoked_at=old,
            expires_at=old,
        )
        db.add(stale)
        db.commit()
        live, _ = svc.create_session(db, uid, now=T0)
        n = svc.purge_sessions(db, now=T0)
        assert n >= 1
        assert db.query(AuthSession).filter_by(id=live.id).first() is not None
        assert db.query(AuthSession).filter_by(id=stale.id).first() is None
    finally:
        db.close()


def test_access_token_carries_sid_and_short_ttl():
    uid = _user(_uid())
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=uid).first()
        row, _ = svc.create_session(db, uid, now=T0)
        token = svc.issue_access_token(user, row.id)
        payload = decode_token(token)
        assert payload is not None
        assert payload["sid"] == row.id
        assert payload["sub"] == str(uid)
        assert "jti" in payload
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        skew = exp - datetime.now(timezone.utc)
        assert timedelta(minutes=14) < skew <= timedelta(minutes=16)
    finally:
        db.close()
