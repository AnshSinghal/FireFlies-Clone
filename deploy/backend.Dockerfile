# Production backend image (T-44.2).
#
# Multi-stage so the runtime image carries the virtualenv and the app, not uv's
# cache or the build context. Runs as a non-root user; two uvicorn workers; no
# --reload. The dev image stays in backend/Dockerfile — this one is only ever
# built by deploy/docker-compose.prod.yml.

FROM python:3.13-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev
COPY . .
RUN uv sync --frozen --no-dev


FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# Non-root: the app needs to write exactly two places — the DB volume
# (mounted at /data) and nothing else. Everything under /app is read-only to it.
RUN useradd --create-home --uid 10001 fireflies

WORKDIR /app
COPY --from=builder --chown=root:root /app /app
RUN mkdir /data && chown fireflies:fireflies /data

USER fireflies

EXPOSE 8000

# Boot order (T-44.4, T-44.6):
#   1. media: the app writes uploads into MEDIA_DIR, and /app is root-owned
#      read-only — so media lives on the /data volume, seeded once from the
#      committed sample (`cp -n` never overwrites what a redeploy finds there)
#   2. migrate (idempotent), 3. seed (idempotent — tops up to the eight demo
#      meetings, never wipes; only an explicit --reset does, and nothing here
#      passes it), 4. serve: two workers on WAL-mode SQLite, fine at demo scale.
CMD ["sh", "-c", "mkdir -p /data/media && cp -n /app/media/* /data/media/ 2>/dev/null; alembic upgrade head && python -m app.seed.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"]
