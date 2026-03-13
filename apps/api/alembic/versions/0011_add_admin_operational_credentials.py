"""add admin operational credentials

Revision ID: 20260314_0011
Revises: 20260313_0010
Create Date: 2026-03-14 01:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260314_0011"
down_revision = "20260313_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_credentials",
        sa.Column("key", sa.String(length=40), nullable=False),
        sa.Column("login_id", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("credential_revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
        sa.UniqueConstraint("login_id"),
    )


def downgrade() -> None:
    op.drop_table("admin_credentials")
