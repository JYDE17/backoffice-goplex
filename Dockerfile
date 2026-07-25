# Multi-stage build for the node-server Nitro output (see package.json's
# build:node-server) - the default `bun run build` targets Cloudflare Workers
# instead, which doesn't run here.
#
# RaceFacer (racefacer.brossard.goplex.ca) is only reachable from the
# Goplex Brossard site network, so the host running this container must be
# on that same network (or reach it via VPN) - Clover and Veloce are
# cloud-hosted and reachable from anywhere.

FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build:node-server

# Nitro's node-server preset bundles its own runtime deps into
# .output/server - the final image only needs that output, not the full
# node_modules tree or source.
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/.output ./.output

EXPOSE 3000
CMD ["bun", "run", ".output/server/index.mjs"]
