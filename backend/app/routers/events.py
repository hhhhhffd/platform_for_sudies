import csv
import io
import os
import secrets
import string
import time
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.logging_config import get_logger
from app.models import Event, Criterion, Team, JudgeToken, Score, User
from app.redis_client import get_redis
from app.schemas import (
    EventCreate, EventCreateResponse, EventListResponse, EventListItem,
    EventDetailResponse, EventUpdate, EventStatusUpdate, JudgeTokenResponse, JudgeTokenUpdate,
    CriterionResponse, TeamResponse, TeamCreate, CriterionCreate,
    TeamUpdate, CriterionUpdate, JudgeCreate,
    ResultsResponse, ResultsDetailResponse, TeamDetailResult, JudgeScoreEntry,
    EventInfo, TeamResult, CriterionBreakdown,
)

UPLOAD_DIR = settings.UPLOAD_DIR
logger = get_logger("events")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB


def _build_event_detail(event: Event) -> EventDetailResponse:
    return EventDetailResponse(
        id=event.id,
        name=event.name,
        description=event.description,
        start_date=event.start_date,
        location=event.location,
        status=event.status,
        scoring_mode=event.scoring_mode,
        notes_enabled=event.notes_enabled,
        background_url=event.background_url,
        alert_enabled=event.alert_enabled,
        alert_title=event.alert_title,
        alert_text=event.alert_text,
        alert_align=event.alert_align,
        alert_button_text=event.alert_button_text,
        overlay_enabled=event.overlay_enabled,
        overlay_color=event.overlay_color,
        overlay_opacity=event.overlay_opacity,
        criteria_label=event.criteria_label,
        criteria_label_enabled=event.criteria_label_enabled,
        teams_label=event.teams_label,
        teams_label_enabled=event.teams_label_enabled,
        criteria=[CriterionResponse(id=c.id, name=c.name, max_score=c.max_score) for c in event.criteria],
        teams=[TeamResponse(id=t.id, name=t.name, description=t.description) for t in event.teams],
        judge_tokens=[
            JudgeTokenResponse(
                id=jt.id, token=jt.token,
                link=f"{settings.FRONTEND_URL}/judge/{event.id}/{jt.token}",
                name=jt.name,
            )
            for jt in event.judge_tokens
        ],
        public_link=f"{settings.FRONTEND_URL}/live/{event.id}",
    )

router = APIRouter(prefix="/api/events", tags=["events"])


def generate_token() -> str:
    chars = string.ascii_uppercase + string.digits
    parts = ["".join(secrets.choice(chars) for _ in range(3)) for _ in range(3)]
    return "-".join(parts)


async def _get_event_progress(db: AsyncSession, event_id: str) -> dict:
    teams_count = (await db.execute(select(func.count(Team.id)).where(Team.event_id == event_id))).scalar() or 0
    criteria_count = (await db.execute(select(func.count(Criterion.id)).where(Criterion.event_id == event_id))).scalar() or 0
    expected_per_judge = teams_count * criteria_count
    result = await db.execute(
        select(JudgeToken.id, JudgeToken.name, func.count(Score.id).label("saved"))
        .outerjoin(Score, Score.judge_id == JudgeToken.id)
        .where(JudgeToken.event_id == event_id, JudgeToken.is_active.is_(True))
        .group_by(JudgeToken.id, JudgeToken.name, JudgeToken.created_at)
        .order_by(JudgeToken.created_at)
    )
    judges = [
        {"id": str(row.id), "name": row.name, "saved": row.saved, "expected": expected_per_judge}
        for row in result.all()
    ]
    return {
        "judges": judges,
        "complete_judges": sum(1 for judge in judges if expected_per_judge > 0 and judge["saved"] >= expected_per_judge),
        "total_judges": len(judges),
    }


async def _compute_score_map(db: AsyncSession, event_id: str) -> dict[tuple, tuple]:
    """Returns {(team_id, criterion_id): (avg_score, judges_count)}."""
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
    return {
        (row.team_id, row.criterion_id): (row.avg_score or Decimal(0), row.judges_count)
        for row in scores_result.all()
    }


@router.post("", response_model=EventCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = Event(
        user_id=user.id,
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        location=data.location,
        scoring_mode=data.scoring_mode,
        notes_enabled=data.notes_enabled,
        alert_enabled=data.alert_enabled,
        alert_title=data.alert_title,
        alert_text=data.alert_text,
        alert_align=data.alert_align,
        alert_button_text=data.alert_button_text,
        overlay_enabled=data.overlay_enabled,
        overlay_color=data.overlay_color,
        overlay_opacity=data.overlay_opacity,
        criteria_label=data.criteria_label,
        criteria_label_enabled=data.criteria_label_enabled,
        teams_label=data.teams_label,
        teams_label_enabled=data.teams_label_enabled,
    )
    db.add(event)
    await db.flush()

    for i, c in enumerate(data.criteria):
        db.add(Criterion(event_id=event.id, name=c.name, max_score=c.max_score, order_index=i))

    for i, t in enumerate(data.teams):
        db.add(Team(event_id=event.id, name=t.name, description=t.description, order_index=i))

    tokens = []
    used_tokens: set[str] = set()
    judge_names = data.judge_names or []
    for i in range(data.judge_count):
        token_str = generate_token()
        while token_str in used_tokens:
            token_str = generate_token()
        used_tokens.add(token_str)
        jt_name = judge_names[i] if i < len(judge_names) else None
        jt = JudgeToken(event_id=event.id, token=token_str, name=jt_name if jt_name else None)
        db.add(jt)
        tokens.append(jt)

    await db.commit()
    await db.refresh(event)
    for t in tokens:
        await db.refresh(t)

    return EventCreateResponse(
        id=event.id,
        name=event.name,
        status=event.status,
        judge_tokens=[
            JudgeTokenResponse(
                id=t.id,
                token=t.token,
                link=f"{settings.FRONTEND_URL}/judge/{event.id}/{t.token}",
                name=t.name,
            )
            for t in tokens
        ],
        public_link=f"{settings.FRONTEND_URL}/live/{event.id}",
    )


@router.get("", response_model=EventListResponse)
async def list_events(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    limit = min(limit, 100)  # cap at 100

    # Count total for pagination
    total_result = await db.execute(
        select(func.count(Event.id))
    )
    total = total_result.scalar() or 0

    result = await db.execute(
        select(Event)
        .options(selectinload(Event.teams), selectinload(Event.judge_tokens))
        .order_by(Event.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    events = result.scalars().all()

    return EventListResponse(
        events=[
            EventListItem(
                id=e.id,
                name=e.name,
                start_date=e.start_date,
                status=e.status,
                teams_count=len(e.teams),
                judges_count=len(e.judge_tokens),
            )
            for e in events
        ],
        total=total,
    )


@router.get("/{event_id}", response_model=EventDetailResponse)
async def get_event(
    event_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(
            selectinload(Event.criteria),
            selectinload(Event.teams),
            selectinload(Event.judge_tokens),
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _build_event_detail(event)


@router.get("/{event_id}/progress")
async def get_event_progress(
    event_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_event_or_404(event_id, db)
    return await _get_event_progress(db, event_id)


@router.patch("/{event_id}", response_model=EventDetailResponse)
async def update_event(
    event_id: str,
    data: EventUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.criteria), selectinload(Event.teams), selectinload(Event.judge_tokens))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.status != "draft" and any(field in data.model_fields_set for field in ("scoring_mode", "notes_enabled")):
        raise HTTPException(status_code=409, detail="Настройки оценивания можно менять только в черновике")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(event, field, value)

    await db.commit()
    await db.refresh(event)

    # reload relations after commit
    result2 = await db.execute(
        select(Event).where(Event.id == event_id)
        .options(selectinload(Event.criteria), selectinload(Event.teams), selectinload(Event.judge_tokens))
    )
    event = result2.scalar_one_or_none()
    return _build_event_detail(event)


@router.patch("/{event_id}/status", response_model=EventDetailResponse)
async def update_event_status(
    event_id: str,
    data: EventStatusUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id).with_for_update())
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    allowed = {"draft": "active", "active": "completed", "completed": "active"}
    if allowed.get(event.status) != data.status:
        raise HTTPException(status_code=409, detail="Недопустимый переход состояния мероприятия")
    progress = await _get_event_progress(db, event_id)
    if event.status == "draft" and (progress["total_judges"] == 0 or not progress["judges"][0]["expected"]):
        raise HTTPException(status_code=409, detail="Добавьте команды, критерии и судей перед началом")
    if event.status == "active" and progress["complete_judges"] < progress["total_judges"] and not data.force:
        raise HTTPException(status_code=409, detail="Не все судьи завершили оценивание")
    event.status = data.status
    await db.commit()

    try:
        redis = await get_redis()
        if redis:
            await redis.publish(f"event:{event.id}:scores", "updated")
    except Exception as exc:
        logger.warning("status_broadcast_failed", event_id=str(event.id), error=str(exc))

    result = await db.execute(
        select(Event).where(Event.id == event_id)
        .options(selectinload(Event.criteria), selectinload(Event.teams), selectinload(Event.judge_tokens))
    )
    return _build_event_detail(result.scalar_one())


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.delete(event)
    await db.commit()


@router.get("/{event_id}/results", response_model=ResultsResponse)
async def get_results(event_id: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint — no auth required."""
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.criteria), selectinload(Event.teams))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if event.status == "draft":
        return ResultsResponse(
            event=EventInfo(name=event.name, start_date=event.start_date, status=event.status),
            results=[],
            background_url=event.background_url,
        )

    score_map = await _compute_score_map(db, event_id)

    team_results = []
    for team in event.teams:
        breakdown = []
        total = Decimal(0)
        for criterion in event.criteria:
            avg_score, jcount = score_map.get((team.id, criterion.id), (Decimal(0), 0))
            avg_rounded = round(avg_score, 2)
            total += avg_rounded
            breakdown.append(CriterionBreakdown(
                criterion=criterion.name,
                score=avg_rounded,
                judges_count=jcount,
            ))
        team_results.append(TeamResult(
            team_id=team.id,
            team_name=team.name,
            total_score=round(total, 2),
            breakdown=breakdown,
        ))

    team_results.sort(key=lambda r: r.total_score, reverse=True)

    return ResultsResponse(
        event=EventInfo(name=event.name, start_date=event.start_date, status=event.status),
        results=team_results,
        background_url=event.background_url,
    )


@router.get("/{event_id}/results/detail", response_model=ResultsDetailResponse)
async def get_results_detail(event_id: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint — full per-judge score breakdown."""
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.criteria), selectinload(Event.teams), selectinload(Event.judge_tokens))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.status != "completed":
        raise HTTPException(status_code=403, detail="Подробные результаты откроются после завершения")

    # All judge tokens for this event (ordered by creation)
    all_judges = {str(jt.id): jt for jt in event.judge_tokens}

    # Load all scores
    scores_result = await db.execute(
        select(Score).where(Score.event_id == event_id)
    )
    score_rows = scores_result.scalars().all()

    # Build: {team_id: {judge_id: {scores, notes}}}
    data: dict = {}
    for score in score_rows:
        tid = str(score.team_id)
        jid = str(score.judge_id)
        cid = str(score.criterion_id)
        if tid not in data:
            data[tid] = {}
        if jid not in data[tid]:
            data[tid][jid] = {"scores": {}, "notes": None}
        data[tid][jid]["scores"][cid] = score.value
        if score.notes:
            data[tid][jid]["notes"] = score.notes

    criterion_ids = [str(c.id) for c in event.criteria]
    team_details = []
    for team in event.teams:
        tid = str(team.id)
        judges = []
        # Include ALL judges — even those with no scores yet
        for jid, jt in all_judges.items():
            jdata = data.get(tid, {}).get(jid, {"scores": {}, "notes": None})
            scores_map = {cid: Decimal(str(jdata["scores"].get(cid, 0))) for cid in criterion_ids}
            total = sum(scores_map.values())
            judges.append(JudgeScoreEntry(
                judge_id=jid,
                judge_name=jt.name,
                scores=scores_map,
                total=round(total, 2),
                notes=jdata["notes"],
            ))
        team_details.append(TeamDetailResult(
            team_id=team.id,
            team_name=team.name,
            team_description=team.description,
            judges=judges,
        ))

    return ResultsDetailResponse(
        event=EventInfo(name=event.name, start_date=event.start_date, status=event.status),
        criteria=[CriterionResponse(id=c.id, name=c.name, max_score=c.max_score) for c in event.criteria],
        teams=team_details,
    )


@router.get("/{event_id}/export.csv")
async def export_csv(
    event_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Reuse results logic
    result = await db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.criteria), selectinload(Event.teams))
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    score_map_raw = await _compute_score_map(db, event_id)
    score_map: dict[tuple, Decimal] = {
        k: round(v[0], 2) for k, v in score_map_raw.items()
    }

    output = io.StringIO()
    writer = csv.writer(output)

    header = ["Team", "Total Score"] + [c.name for c in event.criteria]
    writer.writerow(header)

    rows = []
    for team in event.teams:
        criterion_scores = [score_map.get((team.id, c.id), Decimal(0)) for c in event.criteria]
        total = sum(criterion_scores)
        rows.append((team.name, total, criterion_scores))

    rows.sort(key=lambda r: r[1], reverse=True)
    for name, total, cscores in rows:
        writer.writerow([name, str(total)] + [str(s) for s in cscores])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=results_{event_id}.csv"},
    )


@router.post("/{event_id}/background")
async def upload_background(
    event_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    ext = (file.filename or "img").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        ext = "jpg"
    filename = f"event_{event_id}.{ext}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(content)

    event.background_url = f"/api/static/{filename}?v={int(time.time())}"
    await db.commit()
    return {"url": event.background_url}


@router.delete("/{event_id}/background", status_code=status.HTTP_204_NO_CONTENT)
async def delete_background(
    event_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.background_url:
        filepath = os.path.join(UPLOAD_DIR, event.background_url.split("?")[0].split("/")[-1])
        if os.path.exists(filepath):
            os.remove(filepath)
        event.background_url = None
        await db.commit()


@router.patch("/{event_id}/judges/{judge_token_id}")
async def update_judge(
    event_id: str,
    judge_token_id: str,
    data: JudgeTokenUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event_result = await db.execute(select(Event).where(Event.id == event_id))
    event = event_result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    jt_result = await db.execute(
        select(JudgeToken).where(JudgeToken.id == judge_token_id, JudgeToken.event_id == event_id)
    )
    jt = jt_result.scalar_one_or_none()
    if not jt:
        raise HTTPException(status_code=404, detail="Judge token not found")

    jt.name = data.name
    await db.commit()
    return JudgeTokenResponse(
        id=jt.id,
        token=jt.token,
        link=f"{settings.FRONTEND_URL}/judge/{event_id}/{jt.token}",
        name=jt.name,
    )


@router.post("/{event_id}/reset-alerts", status_code=status.HTTP_204_NO_CONTENT)
async def reset_alerts(
    event_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.alert_version = (event.alert_version or 0) + 1
    await db.commit()


# ── Teams CRUD ──────────────────────────────────────────────────────────────

async def _get_event_or_404(event_id: str, db: AsyncSession, draft_only: bool = False) -> Event:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if draft_only and event.status != "draft":
        raise HTTPException(status_code=409, detail="Состав и критерии можно менять только в черновике")
    return event


@router.post("/{event_id}/teams", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def add_team(event_id: str, data: TeamCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(event_id, db, draft_only=True)
    cnt = (await db.execute(select(func.count(Team.id)).where(Team.event_id == event_id))).scalar() or 0
    team = Team(event_id=event_id, name=data.name, description=data.description, order_index=cnt)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return TeamResponse(id=team.id, name=team.name, description=team.description)


@router.patch("/{event_id}/teams/{team_id}", response_model=TeamResponse)
async def update_team(event_id: str, team_id: str, data: TeamUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(event_id, db, draft_only=True)
    result = await db.execute(select(Team).where(Team.id == team_id, Team.event_id == event_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    team.name = data.name
    team.description = data.description
    await db.commit()
    await db.refresh(team)
    return TeamResponse(id=team.id, name=team.name, description=team.description)


@router.delete("/{event_id}/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(event_id: str, team_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(event_id, db, draft_only=True)
    result = await db.execute(select(Team).where(Team.id == team_id, Team.event_id == event_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    await db.delete(team)
    await db.commit()


# ── Criteria CRUD ────────────────────────────────────────────────────────────

@router.post("/{event_id}/criteria", response_model=CriterionResponse, status_code=status.HTTP_201_CREATED)
async def add_criterion(event_id: str, data: CriterionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(event_id, db, draft_only=True)
    cnt = (await db.execute(select(func.count(Criterion.id)).where(Criterion.event_id == event_id))).scalar() or 0
    c = Criterion(event_id=event_id, name=data.name, max_score=data.max_score, order_index=cnt)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return CriterionResponse(id=c.id, name=c.name, max_score=c.max_score)


@router.patch("/{event_id}/criteria/{criterion_id}", response_model=CriterionResponse)
async def update_criterion(event_id: str, criterion_id: str, data: CriterionUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(event_id, db, draft_only=True)
    result = await db.execute(select(Criterion).where(Criterion.id == criterion_id, Criterion.event_id == event_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Criterion not found")
    c.name = data.name
    c.max_score = data.max_score
    await db.commit()
    await db.refresh(c)
    return CriterionResponse(id=c.id, name=c.name, max_score=c.max_score)


@router.delete("/{event_id}/criteria/{criterion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_criterion(event_id: str, criterion_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(event_id, db, draft_only=True)
    result = await db.execute(select(Criterion).where(Criterion.id == criterion_id, Criterion.event_id == event_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Criterion not found")
    await db.delete(c)
    await db.commit()


# ── Judge add ────────────────────────────────────────────────────────────────

@router.post("/{event_id}/judges", response_model=JudgeTokenResponse, status_code=status.HTTP_201_CREATED)
async def add_judge(event_id: str, data: JudgeCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(event_id, db)
    token_str = generate_token()
    # ensure uniqueness
    while (await db.execute(select(JudgeToken).where(JudgeToken.token == token_str))).scalar_one_or_none():
        token_str = generate_token()
    jt = JudgeToken(event_id=event_id, token=token_str, name=data.name if data.name else None)
    db.add(jt)
    await db.commit()
    await db.refresh(jt)
    return JudgeTokenResponse(id=jt.id, token=jt.token, link=f"{settings.FRONTEND_URL}/judge/{event_id}/{jt.token}", name=jt.name)
