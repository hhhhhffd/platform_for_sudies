from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.auth import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token,
)
from app.database import get_db
from app.models import User
from app.schemas import (
    AuthRegister, AuthLogin, AuthRefresh,
    RegisterResponse, TokenResponse, UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(data: AuthRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")

    user = User(email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token({"sub": str(user.id), "type": "access"})
    refresh_token = create_refresh_token({"sub": str(user.id), "type": "refresh"})

    return RegisterResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(id=user.id, email=user.email),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: AuthLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token({"sub": str(user.id), "type": "access"})
    refresh_token = create_refresh_token({"sub": str(user.id), "type": "refresh"})

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: AuthRefresh, db: AsyncSession = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=401, detail="User no longer exists")

    access_token = create_access_token({"sub": user_id, "type": "access"})
    refresh_token = create_refresh_token({"sub": user_id, "type": "refresh"})

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)
