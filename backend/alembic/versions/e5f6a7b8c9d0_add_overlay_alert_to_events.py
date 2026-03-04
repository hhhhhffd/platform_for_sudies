"""add overlay and alert fields to events

Revision ID: e5f6a7b8c9d0
Revises: c3d4e5f6a7b8
Create Date: 2026-03-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('events', sa.Column('alert_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('events', sa.Column('alert_title', sa.String(255), nullable=True))
    op.add_column('events', sa.Column('alert_text', sa.Text(), nullable=True))
    op.add_column('events', sa.Column('overlay_enabled', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('events', sa.Column('overlay_color', sa.String(7), nullable=False, server_default='#000000'))
    op.add_column('events', sa.Column('overlay_opacity', sa.Numeric(4, 2), nullable=False, server_default='0.35'))


def downgrade() -> None:
    op.drop_column('events', 'overlay_opacity')
    op.drop_column('events', 'overlay_color')
    op.drop_column('events', 'overlay_enabled')
    op.drop_column('events', 'alert_text')
    op.drop_column('events', 'alert_title')
    op.drop_column('events', 'alert_enabled')
