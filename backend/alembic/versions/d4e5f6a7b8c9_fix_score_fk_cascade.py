"""fix score FK cascade

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-02-24

"""
from alembic import op

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('scores_event_id_fkey', 'scores', type_='foreignkey')
    op.drop_constraint('scores_judge_id_fkey', 'scores', type_='foreignkey')
    op.create_foreign_key(
        'scores_event_id_fkey', 'scores', 'events', ['event_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'scores_judge_id_fkey', 'scores', 'judge_tokens', ['judge_id'], ['id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('scores_event_id_fkey', 'scores', type_='foreignkey')
    op.drop_constraint('scores_judge_id_fkey', 'scores', type_='foreignkey')
    op.create_foreign_key(
        'scores_event_id_fkey', 'scores', 'events', ['event_id'], ['id']
    )
    op.create_foreign_key(
        'scores_judge_id_fkey', 'scores', 'judge_tokens', ['judge_id'], ['id']
    )
