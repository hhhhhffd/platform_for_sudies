from datetime import datetime, timezone
from hmac import compare_digest

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.auth import (
    ORGANIZER_EMAIL, organizer_key_version, get_current_user, create_access_token,
    create_refresh_token, decode_token,
    set_auth_cookies, clear_auth_cookies,
)
from app.config import settings
from app.database import get_db
from app.logging_config import get_logger
from app.models import User
from app.schemas import AuthLogin

logger = get_logger("auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, data: AuthLogin, response: Response, db: AsyncSession = Depends(get_db)):
    totp = pyotp.TOTP(settings.ORGANIZER_TOTP_SECRET)
    current_step = totp.timecode(datetime.now(timezone.utc))
    matched_step = next(
        (step for step in range(current_step + 1, current_step - 2, -1)
         if compare_digest(totp.at(step * totp.interval), data.code)),
        None,
    )
    if matched_step is None:
        logger.warning("login_failed", ip=request.client.host if request.client else None)
        raise HTTPException(status_code=401, detail="Неверный или устаревший код")

    await db.execute(
        insert(User).values(email=ORGANIZER_EMAIL, password_hash="!")
        .on_conflict_do_nothing(index_elements=[User.email])
    )
    result = await db.execute(select(User).where(User.email == ORGANIZER_EMAIL).with_for_update())
    user = result.scalar_one()
    key_version = organizer_key_version()
    if user.totp_key_version == key_version and user.totp_last_step is not None and matched_step <= user.totp_last_step:
        await db.rollback()
        raise HTTPException(status_code=401, detail="Код уже использован. Дождитесь следующего")
    user.totp_last_step = matched_step
    user.totp_key_version = key_version
    await db.commit()

    logger.info("login_success", user_id=str(user.id))
    claims = {"sub": str(user.id), "key_version": key_version}
    access_token = create_access_token({**claims, "type": "organizer_access"})
    refresh_token = create_refresh_token({**claims, "type": "organizer_refresh"})

    set_auth_cookies(response, access_token, refresh_token)

    return {"ok": True}


@router.post("/refresh")
@limiter.limit("10/minute")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token provided")

    payload = decode_token(refresh_token)
    if payload.get("type") != "organizer_refresh" or payload.get("key_version") != organizer_key_version():
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    try:
        parsed_id = UUID(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    result = await db.execute(select(User).where(User.id == parsed_id, User.email == ORGANIZER_EMAIL))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=401, detail="User no longer exists")

    claims = {"sub": user_id, "key_version": organizer_key_version()}
    new_access = create_access_token({**claims, "type": "organizer_access"})
    new_refresh = create_refresh_token({**claims, "type": "organizer_refresh"})

    set_auth_cookies(response, new_access, new_refresh)

    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/session")
async def session(user: User = Depends(get_current_user)):
    return {"authenticated": True}
