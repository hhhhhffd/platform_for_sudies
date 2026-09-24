"""add organizer TOTP replay state

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
"""

from alembic import op
import sqlalchemy as sa


revision = "i9j0k1l2m3n4"
down_revision = "h8i9j0k1l2m3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_last_step", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("totp_key_version", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "totp_key_version")
    op.drop_column("users", "totp_last_step")
