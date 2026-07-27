#!/usr/bin/env bash
# Pull-based continuous deployment (T-44).
#
# Ran by fireflies-deploy.timer every 90 seconds. Compares the local HEAD to
# origin/main and rebuilds ONLY when they differ, so the steady state is one
# cheap `git fetch` per tick and nothing else. `--force` skips the comparison
# for a first install or a manual redeploy.
#
# Push-based (GitHub Actions → SSH) was considered and rejected: it needs a
# deploy key and repo secrets, and the repo is public anyway — polling gets
# the same "every push to main deploys" contract with zero shared secrets.

set -euo pipefail

APP_DIR="${FIREFLIES_DIR:-$HOME/apps/fireflies}"
LOCK="/tmp/fireflies-deploy.lock"
LOG_PREFIX="[fireflies-deploy]"

log() { echo "$LOG_PREFIX $(date -u +%FT%TZ) $*"; }

# One deploy at a time: a slow build must not overlap the next timer tick.
exec 9>"$LOCK"
if ! flock -n 9; then
  log "another deploy is running; skipping"
  exit 0
fi

cd "$APP_DIR"
git fetch origin main --quiet

local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse origin/main)"

if [[ "$local_sha" == "$remote_sha" && "${1:-}" != "--force" ]]; then
  exit 0
fi

log "deploying $remote_sha (was $local_sha)"

# The checkout is deploy-only; nothing edits it, so hard reset is safe.
git reset --hard origin/main --quiet

# Build first, then swap — a failed build leaves the running stack untouched.
docker compose -f deploy/docker-compose.prod.yml build --quiet
docker compose -f deploy/docker-compose.prod.yml up -d

# The box runs another product's stack and sits at >90% disk; reclaim build
# leftovers every time, but never touch volumes (the demo DB lives there).
docker image prune -f >/dev/null

log "deployed $(git rev-parse --short HEAD)"
