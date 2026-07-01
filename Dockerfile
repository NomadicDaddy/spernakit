# ============================================================================
# Spernakit v3 - Multi-stage Docker Build
# ============================================================================
# Produces a single container with:
#   - nginx serving frontend static files and proxying API/WS
#   - Bun backend running the Elysia server
#   - supervisord managing both processes
# ============================================================================

# --------------------------------------------------------------------------
# Stage 1: Base builder - install dependencies
# --------------------------------------------------------------------------
FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS base-builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy workspace-level files
COPY package.json bun.lock bunfig.toml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY shared/package.json shared/

# Puppeteer's Chrome download isn't needed for backend/frontend builds; devDep
# only matters for crawltest outside the container. Skip to avoid flaky network
# fetches to storage.googleapis.com blocking the Docker build.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install all dependencies
RUN bun install --frozen-lockfile

# --------------------------------------------------------------------------
# Stage 2: Backend builder - compile TypeScript
# --------------------------------------------------------------------------
FROM base-builder AS backend-builder

COPY shared/ shared/
COPY backend/ backend/

WORKDIR /app/backend
RUN bunx tsc

# --------------------------------------------------------------------------
# Stage 3: Frontend builder - build production bundle
# --------------------------------------------------------------------------
FROM base-builder AS frontend-builder

COPY shared/ shared/
COPY frontend/ frontend/
# vite.config.ts reads app name from defaults.json and version from root package.json
COPY backend/src/config/defaults.json backend/src/config/defaults.json

WORKDIR /app/frontend
RUN bunx tsc -p tsconfig.build.json && bunx vite build

# --------------------------------------------------------------------------
# Stage 4: Production image
# --------------------------------------------------------------------------
FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS production

# Install runtime dependencies (pinned to minor version for reproducible builds).
# Also upgrade the OpenSSL libs past the base image's pinned digest to pick up
# security fixes (e.g. CVE-2026-45447) without waiting for a new base image.
RUN apk add --no-cache nginx~=1.28 nginx-mod-http-brotli supervisor~=4.2 gettext~=0.24 \
    && apk add --no-cache --upgrade libcrypto3 libssl3

WORKDIR /app

# Copy shared workspace (types/constants only, needed by backend at runtime)
COPY --from=backend-builder /app/shared/ shared/

# Copy backend
COPY --from=backend-builder /app/backend/ backend/
COPY --from=backend-builder /app/node_modules/ node_modules/
COPY --from=backend-builder /app/backend/node_modules/ backend/node_modules/

# Remove native build artifacts and test files from node_modules
RUN find /app/node_modules -name '*.o' -o -name '*.gyp' -o -name 'Makefile' | xargs rm -f 2>/dev/null; \
    find /app/node_modules -type d -name 'gyp' | xargs rm -rf 2>/dev/null; \
    rm -rf /app/backend/test /app/backend/src/test

# Strip esbuild from the runtime image. It is a build-only tool (used by vite,
# drizzle-kit and tsx during the builder stages) and is never invoked at runtime
# here — the backend runs on Bun's own transpiler. Its prebuilt Go binary
# otherwise ships a CRITICAL + several HIGH Go-stdlib CVEs that Trivy flags on
# the published image.
RUN find /app/node_modules -type d -name '*esbuild*' -prune -exec rm -rf {} + 2>/dev/null || true

# Copy frontend build output
COPY --from=frontend-builder /app/frontend/dist/ frontend/dist/

# Copy configuration and scripts (config/*.json is mounted at runtime, not baked into image)
COPY package.json bunfig.toml ./
COPY scripts/migrate.ts scripts/load-json-config.ts scripts/
COPY scripts/lib/ scripts/lib/
COPY docker/nginx.conf /etc/nginx/nginx.conf.template
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/start.sh /app/start.sh
COPY docker/wait-and-start-nginx.sh /app/docker/wait-and-start-nginx.sh

# Use the existing 'bun' user (UID/GID 1000) from the base image for non-root operation

# Create required directories and set ownership for non-root user
RUN mkdir -p /app/data /app/logs /app/backups /app/config /var/log/supervisor /run/nginx /var/log/nginx \
       /var/lib/nginx/logs /var/lib/nginx/tmp \
    && chmod +x /app/start.sh /app/docker/wait-and-start-nginx.sh \
    && chown -R bun /app/data /app/logs /app/backups /app/config \
       /var/log/supervisor /run/nginx /var/log/nginx /var/lib/nginx

# Expose the single nginx port
EXPOSE 3330

# Health check (uses FRONTEND_PORT env var, falls back to 3330)
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${FRONTEND_PORT:-3330}/api/v1/health || exit 1

USER bun
ENTRYPOINT ["/app/start.sh"]
