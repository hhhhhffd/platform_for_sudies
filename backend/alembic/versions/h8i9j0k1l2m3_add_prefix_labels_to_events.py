"""add criteria/teams label fields to events

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Branch_labels = None
depends_on = None

"""
from alembic import op
import sqlalchemy as sa

revision = 'h8i9j0k1l2m3'
down_revision = 'g7h8i9j0k1l2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('events', sa.Column('criteria_label', sa.String(50), nullable=True))
    op.add_column('events', sa.Column('criteria_label_enabled', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('events', sa.Column('teams_label', sa.String(50), nullable=True))
    op.add_column('events', sa.Column('teams_label_enabled', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('events', 'teams_label_enabled')
    op.drop_column('events', 'teams_label')
    op.drop_column('events', 'criteria_label_enabled')
    op.drop_column('events', 'criteria_label')
