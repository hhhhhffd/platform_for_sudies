from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_judge, create_access_token
from app.database import get_db
from app.logging_config import get_logger
from app.models import JudgeToken, Event, Score, Criterion, Team
from app.redis_client import get_redis

logger = get_logger("judge")
from app.schemas import (
    JudgeAuth, JudgeAuthResponse, JudgeEventResponse,
    EventInfo, CriterionResponse, TeamResponse,
    ScoresBatch, ScoresSavedResponse, JudgeProgressResponse,
)

router = APIRouter(prefix="/api/judge", tags=["judge"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/auth", response_model=JudgeAuthResponse)
@limiter.limit("10/minute")
async def judge_auth(request: Request, data: JudgeAuth, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(JudgeToken).where(JudgeToken.token == data.token))
    judge = result.scalar_one_or_none()
    if not judge:
        raise HTTPException(status_code=404, detail="Token not found")
    if not judge.is_active:
        raise HTTPException(status_code=403, detail="Token inactive")

    access_token = create_access_token(
        {"sub": str(judge.id), "type": "judge"},
        expires_delta=timedelta(days=30),
    )
    return JudgeAuthResponse(access_token=access_token, event_id=judge.event_id, judge_id=judge.id)


@router.get("/events/{event_id}", response_model=JudgeEventResponse)
async def get_judge_event(
    event_id: str,
    judge: JudgeToken = Depends(get_current_judge),
    db: AsyncSession = Depends(get_db),
):
    if str(judge.event_id) != event_id:
        raise HTTPException(status_code=403, detail="Token does not belong to this event")

    result = await db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.criteria), selectinload(Event.teams))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    return JudgeEventResponse(
        event=EventInfo(name=event.name, start_date=event.start_date),
        criteria=[CriterionResponse(id=c.id, name=c.name, max_score=c.max_score) for c in event.criteria],
        teams=[TeamResponse(id=t.id, name=t.name, description=t.description) for t in event.teams],
        scoring_mode=event.scoring_mode,
        notes_enabled=event.notes_enabled,
        background_url=event.background_url,
        judge_name=judge.name,
        alert_enabled=event.alert_enabled,
        alert_title=event.alert_title,
        alert_text=event.alert_text,
        alert_align=event.alert_align,
        alert_button_text=event.alert_button_text,
        alert_version=event.alert_version or 0,
        overlay_enabled=event.overlay_enabled,
        overlay_color=event.overlay_color,
        overlay_opacity=event.overlay_opacity,
        criteria_label=event.criteria_label,
        criteria_label_enabled=event.criteria_label_enabled,
        teams_label=event.teams_label,
        teams_label_enabled=event.teams_label_enabled,
    )


@router.put("/scores", response_model=ScoresSavedResponse)
async def save_scores(
    data: ScoresBatch,
    judge: JudgeToken = Depends(get_current_judge),
    db: AsyncSession = Depends(get_db),
):
    # Validate all teams and criteria belong to this event
    team_ids = {s.team_id for s in data.scores}
    criterion_ids = {s.criterion_id for s in data.scores}

    teams_result = await db.execute(
        select(Team).where(Team.event_id == judge.event_id, Team.id.in_(team_ids))
    )
    valid_teams = {t.id for t in teams_result.scalars().all()}

    criteria_result = await db.execute(
        select(Criterion).where(Criterion.event_id == judge.event_id, Criterion.id.in_(criterion_ids))
    )
    valid_criteria = {c.id: c.max_score for c in criteria_result.scalars().all()}

    for s in data.scores:
        if s.team_id not in valid_teams:
            raise HTTPException(status_code=404, detail=f"Team {s.team_id} not found in this event")
        if s.criterion_id not in valid_criteria:
            raise HTTPException(status_code=404, detail=f"Criterion {s.criterion_id} not found in this event")
        if s.value > valid_criteria[s.criterion_id]:
            raise HTTPException(status_code=422, detail=f"Value {s.value} exceeds max_score {valid_criteria[s.criterion_id]} for criterion {s.criterion_id}")

    now = datetime.now(timezone.utc)
    for s in data.scores:
        stmt = pg_insert(Score).values(
            event_id=judge.event_id,
            team_id=s.team_id,
            judge_id=judge.id,
            criterion_id=s.criterion_id,
            value=s.value,
            notes=s.notes,
            created_at=now,
            updated_at=now,
        ).on_conflict_do_update(
            constraint="unique_score",
            set_={"value": s.value, "notes": s.notes, "updated_at": now},
        )
        await db.execute(stmt)

    await db.commit()

    # Publish update to Redis for WebSocket (with auto-reconnect)
    try:
        redis = await get_redis()
        if redis:
            await redis.publish(f"event:{judge.event_id}:scores", "updated")
    except Exception:
        pass  # Redis not available, skip WebSocket notification

    logger.info("scores_saved", judge_id=str(judge.id), event_id=str(judge.event_id), count=len(data.scores))
    return ScoresSavedResponse(saved=len(data.scores))


@router.get("/events/{event_id}/progress", response_model=JudgeProgressResponse)
async def get_progress(
    event_id: str,
    judge: JudgeToken = Depends(get_current_judge),
    db: AsyncSession = Depends(get_db),
):
    if str(judge.event_id) != event_id:
        raise HTTPException(status_code=403, detail="Token does not belong to this event")

    # Count total teams
    total_result = await db.execute(
        select(func.count(Team.id)).where(Team.event_id == event_id)
    )
    total_teams = total_result.scalar() or 0

    # Count total criteria
    criteria_result = await db.execute(
        select(func.count(Criterion.id)).where(Criterion.event_id == event_id)
    )
    total_criteria = criteria_result.scalar() or 0

    if total_criteria == 0:
        return JudgeProgressResponse(total_teams=total_teams, scored_teams=0, percentage=0)

    # A team is "scored" if the judge has scores for ALL criteria of that team
    scored_result = await db.execute(
        select(Score.team_id, func.count(Score.criterion_id).label("cnt"))
        .where(Score.judge_id == judge.id, Score.event_id == event_id)
        .group_by(Score.team_id)
    )
    scored_teams = sum(1 for row in scored_result.all() if row.cnt >= total_criteria)

    percentage = int(scored_teams / total_teams * 100) if total_teams > 0 else 0

    return JudgeProgressResponse(
        total_teams=total_teams,
        scored_teams=scored_teams,
        percentage=percentage,
    )
