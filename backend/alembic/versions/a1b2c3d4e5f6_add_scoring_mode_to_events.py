"""add scoring_mode to events

Revision ID: a1b2c3d4e5f6
Revises: 388c5d24637c
Create Date: 2026-02-23 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '388c5d24637c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('events', sa.Column('scoring_mode', sa.String(20), nullable=False, server_default='team'))


def downgrade() -> None:
    op.drop_column('events', 'scoring_mode')
