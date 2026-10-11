# syntax=docker/dockerfile:1.7
# Varanasi people app, LOCAL demo image (test money only, local anvil chain).
# Build context: the repo root (needs contracts/ for the seed artifacts).
#   docker build -f docker/people-app.Dockerfile -t varanasi-people-app .
# The public demo (browser ledger) is the same image with
#   --build-arg VARANASI_MODE=public
# Nothing in this image talks to a public network or holds a real key.

# ---- 1. contract artifacts (forge build) ----
FROM ghcr.io/foundry-rs/foundry:stable AS contracts
WORKDIR /src/contracts
COPY contracts/foundry.toml contracts/foundry.lock* ./
COPY contracts/lib ./lib
COPY contracts/src ./src
RUN forge build --skip test --skip script

# ---- 2. app dependencies ----
FROM node:22.18-bookworm-slim AS deps
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

# ---- 3. next build ----
FROM node:22.18-bookworm-slim AS build
WORKDIR /app
ARG VARANASI_MODE=local
ENV NEXT_TELEMETRY_DISABLED=1 \
    VERCEL=1
COPY --from=deps /app/node_modules ./node_modules
COPY app/ ./
# VERCEL=1 only makes next.config.js use the default .next folder in both modes
RUN NEXT_PUBLIC_VARANASI_MODE="$VARANASI_MODE" npx next build

# ---- 4. runtime ----
FROM node:22.18-bookworm-slim AS runner
WORKDIR /app
ARG VARANASI_MODE=local
ENV NEXT_PUBLIC_VARANASI_MODE=$VARANASI_MODE \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_PORT=3100 \
    VARANASI_RUNTIME=/app/runtime \
    CONTRACTS_OUT=/app/contracts-out
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl=7.* tini=0.19.* \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/runtime && chown node:node /app/runtime
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/package.json /app/next.config.js ./
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=contracts --chown=node:node /src/contracts/out ./contracts-out
COPY --chown=node:node docker/people-app-entrypoint.sh /usr/local/bin/people-app-entrypoint
USER node
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=10 \
  CMD curl -fsS "http://127.0.0.1:${APP_PORT}/" >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/people-app-entrypoint"]
