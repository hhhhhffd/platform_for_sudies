from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.auth import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token,
    set_auth_cookies, clear_auth_cookies,
)
from app.database import get_db
from app.logging_config import get_logger
from app.models import User

logger = get_logger("auth")
from app.schemas import (
    AuthRegister, AuthLogin, AuthRefresh,
    RegisterResponse, TokenResponse, UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/register", status_code=status.HTTP_403_FORBIDDEN)
@limiter.limit("3/minute")
async def register(request: Request, data: AuthRegister, db: AsyncSession = Depends(get_db)):
    # Registration is disabled. Accounts are created manually.
    # To create an account, see the instructions in the project README.
    #
    # Original logic (kept for reference):
    # existing = await db.execute(select(User).where(User.email == data.email))
    # if existing.scalar_one_or_none():
    #     raise HTTPException(status_code=400, detail="Email already exists")
    #
    # user = User(email=data.email, password_hash=hash_password(data.password))
    # db.add(user)
    # await db.commit()
    # await db.refresh(user)
    #
    # access_token = create_access_token({"sub": str(user.id), "type": "access"})
    # refresh_token = create_refresh_token({"sub": str(user.id), "type": "refresh"})
    #
    # return RegisterResponse(
    #     access_token=access_token,
    #     refresh_token=refresh_token,
    #     user=UserResponse(id=user.id, email=user.email),
    # )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Регистрация временно недоступна",
    )


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, data: AuthLogin, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        logger.warning("login_failed", email=data.email, ip=request.client.host if request.client else None)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    logger.info("login_success", user_id=str(user.id), email=data.email)
    access_token = create_access_token({"sub": str(user.id), "type": "access"})
    refresh_token = create_refresh_token({"sub": str(user.id), "type": "refresh"})

    set_auth_cookies(response, access_token, refresh_token)

    return {"access_token": access_token, "refresh_token": refresh_token}


@router.post("/refresh")
@limiter.limit("10/minute")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Try to get refresh token from cookie first, then from body
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        try:
            body = await request.json()
            refresh_token = body.get("refresh_token")
        except Exception:
            pass
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token provided")

    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=401, detail="User no longer exists")

    new_access = create_access_token({"sub": user_id, "type": "access"})
    new_refresh = create_refresh_token({"sub": user_id, "type": "refresh"})

    set_auth_cookies(response, new_access, new_refresh)

    return {"access_token": new_access, "refresh_token": new_refresh}


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}
