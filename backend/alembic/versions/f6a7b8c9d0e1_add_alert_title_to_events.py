"""add alert_title to events

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Branch_labels = None
depends_on = None

"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('events', sa.Column('alert_title', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('events', 'alert_title')
