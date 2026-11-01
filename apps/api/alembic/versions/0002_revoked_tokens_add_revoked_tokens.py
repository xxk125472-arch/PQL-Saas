"""add revoked tokens

Revision ID: 0002_revoked_tokens
Revises: 0001_initial
Create Date: 2026-11-02
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_revoked_tokens"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "revoked_tokens",
        sa.Column("jti", sa.String(length=36), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("jti"),
    )


def downgrade() -> None:
    op.drop_table("revoked_tokens")
