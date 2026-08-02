#!/usr/bin/env bash
# Build the backoffice image and push it to the Goplex private registry
# (registry.brossard.goplex.ca), so it can be deployed/refreshed as a Portainer
# Swarm stack (see docker-compose.yml). Run from anywhere in the repo.
#
#   ./deploy/build-push.sh          # tags :latest
#   ./deploy/build-push.sh 1.4.0    # tags :1.4.0 and :latest
#
# Build on the same CPU architecture as the server (build directly on the
# server is simplest). To cross-build from a different arch (e.g. an arm64 Mac
# for an amd64 server), swap `docker build` for:
#   docker buildx build --platform linux/amd64 --push -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

REGISTRY="registry.brossard.goplex.ca"
IMAGE="$REGISTRY/backoffice-goplex"
VERSION="${1:-latest}"

echo "Building $IMAGE:$VERSION ..."
docker build -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .

echo "Pushing $IMAGE:$VERSION ..."
docker push "$IMAGE:$VERSION"
if [ "$VERSION" != "latest" ]; then
  docker push "$IMAGE:latest"
fi

echo "Done. Now redeploy the stack (Portainer → Update the stack, or):"
echo "  docker stack deploy -c docker-compose.yml backoffice"
