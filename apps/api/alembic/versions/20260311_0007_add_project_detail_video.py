"""add project detail video

Revision ID: 20260311_0007
Revises: 20260311_0006
Create Date: 2026-03-11 21:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260311_0007"
down_revision = "20260311_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE project_detail_media_kind ADD VALUE IF NOT EXISTS 'video'")

    op.add_column(
        "project_profiles",
        sa.Column("detail_video_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "project_profiles",
        sa.Column("project_intro", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_profiles", "project_intro")
    op.drop_column("project_profiles", "detail_video_url")
