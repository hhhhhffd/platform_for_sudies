from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


# === Auth ===
class AuthRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AuthLogin(BaseModel):
    email: EmailStr
    password: str


class AuthRefresh(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str


class UserResponse(BaseModel):
    id: UUID
    email: str


class RegisterResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserResponse


# === Events ===
class CriterionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    max_score: Decimal = Field(gt=0, le=1000000)


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None


def _clamp_event_date(v: datetime) -> datetime:
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    max_date = datetime(2100, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
    if v < now:
        v = now
    if v > max_date:
        v = max_date
    return v


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    start_date: datetime
    location: Optional[str] = Field(None, max_length=255)

    @field_validator("start_date")
    @classmethod
    def validate_start_date(cls, v: datetime) -> datetime:
        return _clamp_event_date(v)
    criteria: list[CriterionCreate] = Field(min_length=1)
    teams: list[TeamCreate] = Field(min_length=1)
    judge_count: int = Field(ge=1, le=100)
    judge_names: list[Optional[str]] = Field(default_factory=list)
    scoring_mode: str = Field(default="team", pattern="^(team|criterion)$")
    notes_enabled: bool = Field(default=True)
    alert_enabled: bool = Field(default=False)
    alert_title: Optional[str] = Field(None, max_length=255)
    alert_text: Optional[str] = None
    alert_align: str = Field(default="left", pattern="^(left|center|right)$")
    alert_button_text: Optional[str] = Field(None, max_length=255)
    overlay_enabled: bool = Field(default=True)
    overlay_color: str = Field(default="#000000", max_length=7)
    overlay_opacity: Decimal = Field(default=Decimal("0.35"), ge=0, le=1)
    criteria_label: Optional[str] = Field(None, max_length=50)
    criteria_label_enabled: bool = Field(default=True)
    teams_label: Optional[str] = Field(None, max_length=50)
    teams_label_enabled: bool = Field(default=True)


class JudgeTokenResponse(BaseModel):
    id: UUID
    token: str
    link: str
    name: Optional[str] = None


class CriterionResponse(BaseModel):
    id: UUID
    name: str
    max_score: Decimal


class TeamResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None


class EventCreateResponse(BaseModel):
    id: UUID
    name: str
    status: str
    judge_tokens: list[JudgeTokenResponse]
    public_link: str


class EventListItem(BaseModel):
    id: UUID
    name: str
    start_date: datetime
    status: str
    teams_count: int
    judges_count: int


class EventListResponse(BaseModel):
    events: list[EventListItem]


class EventDetailResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    start_date: datetime
    location: Optional[str]
    status: str
    scoring_mode: str
    notes_enabled: bool
    background_url: Optional[str] = None
    alert_enabled: bool = False
    alert_title: Optional[str] = None
    alert_text: Optional[str] = None
    alert_align: str = "left"
    alert_button_text: Optional[str] = None
    overlay_enabled: bool = True
    overlay_color: str = "#000000"
    overlay_opacity: Decimal = Decimal("0.35")
    criteria_label: Optional[str] = None
    criteria_label_enabled: bool = True
    teams_label: Optional[str] = None
    teams_label_enabled: bool = True
    criteria: list[CriterionResponse]
    teams: list[TeamResponse]
    judge_tokens: list[JudgeTokenResponse]
    public_link: str


class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    location: Optional[str] = Field(None, max_length=255)
    scoring_mode: Optional[str] = Field(None, pattern="^(team|criterion)$")
    notes_enabled: Optional[bool] = None
    alert_enabled: Optional[bool] = None
    alert_title: Optional[str] = Field(None, max_length=255)
    alert_text: Optional[str] = None
    alert_align: Optional[str] = Field(None, pattern="^(left|center|right)$")
    alert_button_text: Optional[str] = Field(None, max_length=255)
    overlay_enabled: Optional[bool] = None
    overlay_color: Optional[str] = Field(None, max_length=7)
    overlay_opacity: Optional[Decimal] = Field(None, ge=0, le=1)
    criteria_label: Optional[str] = Field(None, max_length=50)
    criteria_label_enabled: Optional[bool] = None
    teams_label: Optional[str] = Field(None, max_length=50)
    teams_label_enabled: Optional[bool] = None

    @field_validator("start_date")
    @classmethod
    def validate_start_date(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is None:
            return v
        return _clamp_event_date(v)


class JudgeTokenUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)


class TeamUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None


class CriterionUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    max_score: Decimal = Field(gt=0, le=1000000)


class JudgeCreate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)


class CriterionBreakdown(BaseModel):
    criterion: str
    score: Decimal
    judges_count: int


class TeamResult(BaseModel):
    team_id: UUID
    team_name: str
    total_score: Decimal
    breakdown: list[CriterionBreakdown]


class EventInfo(BaseModel):
    name: str
    start_date: datetime


class ResultsResponse(BaseModel):
    event: EventInfo
    results: list[TeamResult]
    background_url: Optional[str] = None


# === Detail results (per-judge breakdown) ===
class JudgeScoreEntry(BaseModel):
    judge_id: UUID
    judge_name: Optional[str]
    scores: dict[str, Decimal]   # criterion_id -> value
    total: Decimal
    notes: Optional[str]


class TeamDetailResult(BaseModel):
    team_id: UUID
    team_name: str
    team_description: Optional[str]
    judges: list[JudgeScoreEntry]


class ResultsDetailResponse(BaseModel):
    event: EventInfo
    criteria: list[CriterionResponse]
    teams: list[TeamDetailResult]


# === Judge ===
class JudgeAuth(BaseModel):
    token: str


class JudgeAuthResponse(BaseModel):
    access_token: str
    event_id: UUID
    judge_id: UUID


class JudgeEventResponse(BaseModel):
    event: EventInfo
    criteria: list[CriterionResponse]
    teams: list[TeamResponse]
    scoring_mode: str
    notes_enabled: bool
    background_url: Optional[str] = None
    judge_name: Optional[str] = None
    alert_enabled: bool = False
    alert_title: Optional[str] = None
    alert_text: Optional[str] = None
    alert_align: str = "left"
    alert_button_text: Optional[str] = None
    alert_version: int = 0
    overlay_enabled: bool = True
    overlay_color: str = "#000000"
    overlay_opacity: Decimal = Decimal("0.35")
    criteria_label: Optional[str] = None
    criteria_label_enabled: bool = True
    teams_label: Optional[str] = None
    teams_label_enabled: bool = True


class ScoreItem(BaseModel):
    team_id: UUID
    criterion_id: UUID
    value: Decimal = Field(ge=0)
    notes: Optional[str] = None


class ScoresBatch(BaseModel):
    scores: list[ScoreItem] = Field(min_length=1)


class ScoresSavedResponse(BaseModel):
    saved: int


class JudgeProgressResponse(BaseModel):
    total_teams: int
    scored_teams: int
    percentage: int
