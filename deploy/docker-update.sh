#!/usr/bin/env bash
# Run this ON THE SERVER, from the project root, whenever you want to pull
# the latest changes and apply them:
#   ./deploy/docker-update.sh
#
# Equivalent of update.ps1 for the Docker deployment (see docker-compose.yml)
# instead of the Windows Scheduled Task on POS 4. Always rebuilds and
# restarts, even if git pull reports no new commits - the local repo can
# already be at the latest commit while the running container still serves
# an older image, and skipping the rebuild in that case leaves the app stale
# with no warning.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

log_path="deploy/update.log"
exec > >(tee -a "$log_path") 2>&1
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

before="$(git rev-parse HEAD)"
echo "Pulling latest changes..."
git pull origin main
after="$(git rev-parse HEAD)"

if [ "$before" = "$after" ]; then
  echo "No new commits ($after) - rebuilding anyway to make sure the running container matches."
else
  echo "New commits found ($before -> $after)."
fi

echo "Building image..."
docker compose build

echo "Restarting the service..."
docker compose up -d

echo "Cleaning up dangling images..."
docker image prune -f >/dev/null

echo "Done. $(docker compose ps --format '{{.Names}}: {{.Status}}')"
