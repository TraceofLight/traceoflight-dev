"""add site profiles

Revision ID: 20260324_0012
Revises: 20260314_0011
Create Date: 2026-03-24 19:15:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260324_0012"
down_revision = "20260314_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_profiles",
        sa.Column("key", sa.String(length=40), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("github_url", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("site_profiles")
