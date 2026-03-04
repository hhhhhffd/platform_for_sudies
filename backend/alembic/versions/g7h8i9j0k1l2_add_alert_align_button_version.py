"""add alert_align, alert_button_text, alert_version to events

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Branch_labels = None
depends_on = None

"""
from alembic import op
import sqlalchemy as sa

revision = 'g7h8i9j0k1l2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('events', sa.Column('alert_align', sa.String(10), nullable=False, server_default='left'))
    op.add_column('events', sa.Column('alert_button_text', sa.String(255), nullable=True))
    op.add_column('events', sa.Column('alert_version', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('events', 'alert_version')
    op.drop_column('events', 'alert_button_text')
    op.drop_column('events', 'alert_align')
