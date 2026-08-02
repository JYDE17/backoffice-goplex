#!/usr/bin/env bash
# Run this ON THE SERVER, from the project root, to pull the latest code and
# roll it out to the Swarm/Portainer stack:
#   ./deploy/docker-update.sh
#
# Pulls main, builds + pushes a fresh image to the private registry
# (deploy/build-push.sh), then redeploys the `backoffice` stack so the service
# pulls the new image. Always rebuilds, even when git reports no new commits -
# the running service can already be behind the pushed image, and skipping the
# rebuild would silently leave it stale.
#
# For a Portainer-managed update instead, skip this and use build-push.sh, then
# "Update the stack" (re-pull) in the Portainer UI.

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
  echo "No new commits ($after) - rebuilding anyway to make sure the service matches."
else
  echo "New commits found ($before -> $after)."
fi

echo "Building + pushing image to the registry..."
./deploy/build-push.sh

echo "Redeploying the stack..."
docker stack deploy -c docker-compose.yml --with-registry-auth backoffice

echo "Cleaning up dangling images..."
docker image prune -f >/dev/null

echo "Done. $(docker stack services backoffice 2>/dev/null || true)"
