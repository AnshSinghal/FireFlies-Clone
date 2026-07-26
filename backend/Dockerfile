# Development image used by docker-compose (T-01.9).
# T-44.2 adds a separate multi-stage production target with a non-root user.

FROM python:3.13-slim

# uv is copied from its official distroless image rather than pip-installed —
# faster, and pins the version explicitly.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Dependencies are installed in their own layer, so editing application code
# does not invalidate the dependency cache on every rebuild.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY . .
RUN uv sync --frozen

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# Migrations run before the server starts, so a fresh volume comes up with a
# working schema rather than 500ing on the first query. Idempotent by design:
# `upgrade head` on an already-current database is a no-op.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
