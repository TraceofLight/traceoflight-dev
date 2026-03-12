"""add post comments

Revision ID: 20260313_0010
Revises: 20260312_0009
Create Date: 2026-03-13 10:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260313_0010"
down_revision = "20260312_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    author_type = postgresql.ENUM("guest", "admin", name="post_comment_author_type", create_type=False)
    visibility = postgresql.ENUM("public", "private", name="post_comment_visibility", create_type=False)
    status = postgresql.ENUM("active", "deleted", name="post_comment_status", create_type=False)

    bind = op.get_bind()
    author_type.create(bind, checkfirst=True)
    visibility.create(bind, checkfirst=True)
    status.create(bind, checkfirst=True)

    op.create_table(
        "post_comments",
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column("root_comment_id", sa.Uuid(), nullable=True),
        sa.Column("reply_to_comment_id", sa.Uuid(), nullable=True),
        sa.Column("author_name", sa.String(length=80), nullable=False),
        sa.Column("author_type", author_type, nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("visibility", visibility, nullable=False),
        sa.Column("status", status, nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("request_ip_hash", sa.String(length=128), nullable=True),
        sa.Column("user_agent_hash", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reply_to_comment_id"], ["post_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["root_comment_id"], ["post_comments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_post_comments_post_id", "post_comments", ["post_id"], unique=False)
    op.create_index("ix_post_comments_root_comment_id", "post_comments", ["root_comment_id"], unique=False)
    op.create_index("ix_post_comments_reply_to_comment_id", "post_comments", ["reply_to_comment_id"], unique=False)
    op.create_index("ix_post_comments_visibility", "post_comments", ["visibility"], unique=False)
    op.create_index("ix_post_comments_status", "post_comments", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_post_comments_status", table_name="post_comments")
    op.drop_index("ix_post_comments_visibility", table_name="post_comments")
    op.drop_index("ix_post_comments_reply_to_comment_id", table_name="post_comments")
    op.drop_index("ix_post_comments_root_comment_id", table_name="post_comments")
    op.drop_index("ix_post_comments_post_id", table_name="post_comments")
    op.drop_table("post_comments")

    bind = op.get_bind()
    postgresql.ENUM(name="post_comment_status", create_type=False).drop(bind, checkfirst=True)
    postgresql.ENUM(name="post_comment_visibility", create_type=False).drop(bind, checkfirst=True)
    postgresql.ENUM(name="post_comment_author_type", create_type=False).drop(bind, checkfirst=True)
