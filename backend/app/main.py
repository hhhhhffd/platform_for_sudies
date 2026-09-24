import asyncio
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.logging_config import setup_logging, get_logger
from app.redis_client import init_redis, close_redis
from app.routers import auth, events, judge, websocket

setup_logging()
logger = get_logger("judgeflow")

UPLOAD_DIR = settings.UPLOAD_DIR

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("starting", version="0.1.0", env=settings.ENV)
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
    logger.info("shutdown_complete")


app = FastAPI(title="JudgeFlow API", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: only allow FRONTEND_URL; localhost is added only in dev
allowed_origins = [settings.FRONTEND_URL]
if settings.FRONTEND_URL != "http://localhost:3000" and settings.ENV != "production":
    allowed_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000, 1)
    if not request.url.path.startswith("/health"):
        logger.info(
            "request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
            ip=request.client.host if request.client else None,
        )
    return response


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
