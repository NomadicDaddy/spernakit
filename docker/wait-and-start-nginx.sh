#!/bin/sh
# Wait for the backend /api/v1/health endpoint to respond 200 before exec'ing
# nginx. This prevents the window where nginx proxies /api/ requests to a
# backend that has bound its port but not yet finished auto-migrations and
# route registration, which manifests as cascading 500s on /api/v1/dashboards
# (and downstream pages) during docker-prod smoke tests.
set -e

BACKEND_PORT="${BACKEND_PORT:-3331}"
HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/api/v1/health"
MAX_WAIT_SECONDS="${BACKEND_READINESS_TIMEOUT:-60}"
SLEEP_INTERVAL=1
ELAPSED=0

echo "Waiting for backend to become healthy at ${HEALTH_URL} (timeout ${MAX_WAIT_SECONDS}s)..."
while [ "$ELAPSED" -lt "$MAX_WAIT_SECONDS" ]; do
	if wget -qO- --timeout=2 --tries=1 "$HEALTH_URL" > /dev/null 2>&1; then
		echo "Backend is healthy (after ${ELAPSED}s). Starting nginx."
		exec nginx -c /tmp/nginx.conf -g "daemon off;"
	fi
	sleep "$SLEEP_INTERVAL"
	ELAPSED=$((ELAPSED + SLEEP_INTERVAL))
done

echo "Backend did not become healthy within ${MAX_WAIT_SECONDS}s — starting nginx anyway." >&2
exec nginx -c /tmp/nginx.conf -g "daemon off;"
