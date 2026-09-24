import asyncio
import json
from decimal import Decimal

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.logging_config import get_logger
from app.models import Event, Score
from app.redis_client import get_redis

logger = get_logger("websocket")

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, event_id: str, websocket: WebSocket):
        await websocket.accept()
        if event_id not in self.connections:
            self.connections[event_id] = []
        self.connections[event_id].append(websocket)

    def disconnect(self, event_id: str, websocket: WebSocket):
        if event_id in self.connections:
            self.connections[event_id].remove(websocket)
            if not self.connections[event_id]:
                del self.connections[event_id]

    async def broadcast(self, event_id: str, message: dict):
        if event_id in self.connections:
            data = json.dumps(message, default=str)
            disconnected = []
            for ws in self.connections[event_id]:
                try:
                    await ws.send_text(data)
                except Exception:
                    disconnected.append(ws)
            for ws in disconnected:
                self.disconnect(event_id, ws)


manager = ConnectionManager()


async def get_results_data(event_id: str) -> dict:
    async with async_session() as db:
        result = await db.execute(
            select(Event)
            .where(Event.id == event_id)
            .options(selectinload(Event.criteria), selectinload(Event.teams))
        )
        event = result.scalar_one_or_none()
        if not event:
            return {"status": "missing", "results": []}
        if event.status == "draft":
            return {"status": event.status, "results": []}

        scores_result = await db.execute(
            select(
                Score.team_id,
                Score.criterion_id,
                func.avg(Score.value).label("avg_score"),
                func.count(Score.judge_id).label("judges_count"),
            )
            .where(Score.event_id == event_id)
            .group_by(Score.team_id, Score.criterion_id)
        )
        score_map: dict[tuple, tuple] = {}
        for row in scores_result.all():
            score_map[(row.team_id, row.criterion_id)] = (
                round(row.avg_score or Decimal(0), 2),
                row.judges_count,
            )

        results = []
        for team in event.teams:
            breakdown = []
            total = Decimal(0)
            for criterion in event.criteria:
                avg_score, jcount = score_map.get((team.id, criterion.id), (Decimal(0), 0))
                total += avg_score
                breakdown.append({
                    "criterion": criterion.name,
                    "score": float(avg_score),
                    "judges_count": jcount,
                })
            results.append({
                "team_id": str(team.id),
                "team_name": team.name,
                "total_score": float(round(total, 2)),
                "breakdown": breakdown,
            })

        results.sort(key=lambda r: r["total_score"], reverse=True)
        return {"status": event.status, "results": results}


async def redis_listener():
    """Background task that listens to Redis PubSub for score updates."""
    while True:
        redis = await get_redis()
        if not redis:
            await asyncio.sleep(5)
            continue

        pubsub = redis.pubsub()
        try:
            await pubsub.psubscribe("event:*:scores")
            logger.info("Redis PubSub listener started")
            async for message in pubsub.listen():
                if message["type"] == "pmessage":
                    channel = message["channel"]
                    # channel format: "event:{event_id}:scores"
                    parts = channel.split(":")
                    if len(parts) == 3:
                        event_id = parts[1]
                        data = await get_results_data(event_id)
                        await manager.broadcast(event_id, {"type": "update", **data})
        except asyncio.CancelledError:
            try:
                await pubsub.punsubscribe("event:*:scores")
            except Exception:
                pass
            return
        except Exception as e:
            logger.warning("Redis PubSub error, reconnecting in 2s: %s", e)
            await asyncio.sleep(2)


@router.websocket("/ws/events/{event_id}/live")
async def websocket_live(websocket: WebSocket, event_id: str):
    await manager.connect(event_id, websocket)
    try:
        # Send current results on connect
        data = await get_results_data(event_id)
        await websocket.send_json({"type": "update", **data})

        # Keep connection alive
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(event_id, websocket)
