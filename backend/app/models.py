import uuid
from datetime import datetime, timezone

from decimal import Decimal

from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Numeric, DateTime,
    ForeignKey, UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    events = relationship("Event", back_populates="owner", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    start_date = Column(DateTime(timezone=True), nullable=False)
    location = Column(String(255))
    status = Column(String(50), default="draft")
    scoring_mode = Column(String(20), default="team", nullable=False)
    notes_enabled = Column(Boolean, default=True, nullable=False)
    background_url = Column(String(500), nullable=True)
    alert_enabled = Column(Boolean, default=False, nullable=False)
    alert_title = Column(String(255), nullable=True)
    alert_text = Column(Text, nullable=True)
    alert_align = Column(String(10), default="left", nullable=False)
    alert_button_text = Column(String(255), nullable=True)
    alert_version = Column(Integer, default=0, nullable=False)
    overlay_enabled = Column(Boolean, default=True, nullable=False)
    overlay_color = Column(String(7), default="#000000", nullable=False)
    overlay_opacity = Column(Numeric(4, 2), default=Decimal("0.35"), nullable=False)
    criteria_label = Column(String(50), nullable=True)
    criteria_label_enabled = Column(Boolean, default=True, nullable=False)
    teams_label = Column(String(50), nullable=True)
    teams_label_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="events")
    criteria = relationship("Criterion", back_populates="event", cascade="all, delete-orphan", order_by="Criterion.order_index")
    teams = relationship("Team", back_populates="event", cascade="all, delete-orphan", order_by="Team.order_index")
    judge_tokens = relationship("JudgeToken", back_populates="event", cascade="all, delete-orphan")

    __table_args__ = (Index("idx_events_user", "user_id"),)


class Criterion(Base):
    __tablename__ = "criteria"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    max_score = Column(Numeric(10, 2), nullable=False)
    order_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    event = relationship("Event", back_populates="criteria")

    __table_args__ = (Index("idx_criteria_event", "event_id"),)


class Team(Base):
    __tablename__ = "teams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    order_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    event = relationship("Event", back_populates="teams")

    __table_args__ = (Index("idx_teams_event", "event_id"),)


class JudgeToken(Base):
    __tablename__ = "judge_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(50), unique=True, nullable=False)
    name = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    event = relationship("Event", back_populates="judge_tokens")

    __table_args__ = (Index("idx_judge_tokens_event", "event_id"),)


class Score(Base):
    __tablename__ = "scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    judge_id = Column(UUID(as_uuid=True), ForeignKey("judge_tokens.id", ondelete="CASCADE"), nullable=False)
    criterion_id = Column(UUID(as_uuid=True), ForeignKey("criteria.id", ondelete="CASCADE"), nullable=False)
    value = Column(Numeric(10, 2), nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("team_id", "judge_id", "criterion_id", name="unique_score"),
        CheckConstraint("value >= 0", name="score_non_negative"),
        Index("idx_scores_event", "event_id"),
        Index("idx_scores_team", "team_id"),
        Index("idx_scores_judge", "judge_id"),
    )
