import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.redis_client import init_redis, close_redis
from app.routers import auth, events, judge, websocket

UPLOAD_DIR = "/app/uploads"


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    await init_redis()
    redis_listener_task = asyncio.create_task(websocket.redis_listener())
    yield
    redis_listener_task.cancel()
    try:
        await redis_listener_task
    except asyncio.CancelledError:
        pass
    await close_redis()


app = FastAPI(title="JudgeFlow API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc)},
    )

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(judge.router)
app.include_router(websocket.router)

os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/api/static", StaticFiles(directory=UPLOAD_DIR), name="static")


@app.get("/health")
async def health():
    return {"status": "ok"}
