import redis.asyncio as aioredis
from app.config import settings
from app.logging_config import get_logger

logger = get_logger("redis")

redis_client: aioredis.Redis | None = None


async def init_redis():
    global redis_client
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await redis_client.ping()
        logger.info("Redis connected")
    except Exception as e:
        logger.warning("Redis unavailable at startup: %s", e)
        redis_client = None


async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.close()
        redis_client = None


async def get_redis() -> aioredis.Redis | None:
    """Get the Redis client, attempting reconnect if it was lost."""
    global redis_client
    if redis_client is not None:
        try:
            await redis_client.ping()
            return redis_client
        except Exception:
            logger.warning("Redis connection lost, attempting reconnect...")
            redis_client = None

    # Try to reconnect
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await redis_client.ping()
        logger.info("Redis reconnected")
        return redis_client
    except Exception as e:
        logger.warning("Redis reconnect failed: %s", e)
        redis_client = None
        return None
