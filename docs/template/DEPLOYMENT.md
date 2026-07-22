# Deployment Guide

This guide covers deploying Spernakit applications to production environments.

## Configuration Approach

Spernakit uses **JSON configuration files** as the single source of truth for application settings.

### Configuration Hierarchy

1. **Primary Source**: `config/{appname}.json` - All application configuration
2. **No `.env` Files**: Bun has `env = false` in `bunfig.toml`, so `.env` is NOT auto-loaded
3. **Development vs Production**: Use different JSON config files per environment
4. **No Exceptions**: All database configuration is read from JSON config

### Why JSON Config?

- **Consistency**: Same configuration approach across deployment environments
- **Version control**: Configuration can be committed and versioned (except secrets)
- **No runtime surprises**: No environment variable injection required
- **Validation**: TypeScript interfaces in `backend/src/config/configLoader.ts` enforce structure

### Environment Variables: Secrets Only

All application configuration is read from JSON config files - **except security secrets**. In production (Docker, Kubernetes), secrets MUST be injected via environment variables rather than stored in config files. See [Environment Variables for Secrets](#environment-variables-for-secrets) for the supported variables.

Other environment variables you may see in Docker configs (e.g., `NODE_ENV`, `VITE_API_URL`, `BACKEND_PORT`) are Docker-specific runtime variables - they are NOT used by the application's config loader.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Docker Deployment](#docker-deployment)
4. [Manual Deployment](#manual-deployment)
5. [Database Setup](#database-setup)
6. [Security Configuration](#security-configuration)
7. [Monitoring & Logging](#monitoring--logging)
8. [Troubleshooting](#troubleshooting)

---

## Environment Directory Layout

Each environment (development, test, staging, production) keeps its own directory tree. No environment's persistent data lives inside another environment's root. This prevents environment bleed, keeps the container build context clean, and isolates secrets.

### Development (source tree)

The development environment lives in the project source tree. `docker-compose.yml` mounts relative paths for local iteration:

```
{workspace-root}/{slug}/           # wherever the repo is checked out
├── config/
│   └── {slug}.json                # Dev config (gitignored)
├── data/                          # Dev SQLite (gitignored)
├── logs/                          # Dev logs (gitignored)
├── backups/                       # Dev backups (gitignored)
├── backend/                       # Source code
├── frontend/                      # Source code
├── docker-compose.yml             # Dev compose (mounts ./data, ./config, etc.)
└── ...
```

### Test / Smoke (production-image smoke testing)

The test environment runs the production Docker image locally for smoke testing. It lives **outside** the source tree to keep the build context clean and prevent environment bleed. By default, `smoke.ts` creates an `{app-slug}-test` root under the operating system temp directory. Set `APPDATA_ROOT` and `BACKUPS_ROOT` to pin stable host roots.

```
%TEMP%\{slug}-test\                # default smoke root on Windows
├── {slug}/
│   ├── config/
│   │   └── {slug}.json            # Smoke-test config (rate limiting disabled)
│   ├── data/                      # Ephemeral - wiped each smoke run
│   ├── logs/                      # Smoke run logs
│   └── backups/                   # Smoke-generated backups
└── ...
```

### Staging

Staging mirrors the production layout on the development workstation. All apps share one staging root, set via `APPDATA_ROOT` — on Windows this defaults to `%ProgramData%\appdata\staging\`:

```
%ProgramData%\appdata\staging\      # APPDATA_ROOT for staging (Windows)
├── spernakit/
│   ├── config/
│   │   ├── spernakit.json         # Staging config (mirrors production)
│   │   └── spernakit.secrets.json # Staging secrets (rotated independently)
│   ├── data/                      # Persistent staging database
│   ├── logs/                      # Staging logs (rotation via pino)
│   └── backups/                   # Staging backup destination
├── your-app/
│   ├── config/
│   ├── data/
│   ├── logs/
│   └── backups/
└── ...
```

**Staging MUST NOT use a volatile drive letter** (e.g., `A:` via `subst` or RAM disk). Drive letters are non-portable, conflict with USB/network devices, and lose data on reboot if backed by a RAM disk. Point `APPDATA_ROOT` at a stable path instead — `%ProgramData%\appdata\` by default, or any fixed directory on persistent storage.

### Production (self-hosted instance)

A production instance runs an explicitly selected image and persists real data. It is distinct
from smoke (ephemeral test runs) and staging (production-shape rehearsal). Spernakit itself uses
locally built verification images; a derived project separately decides whether to operate a
registry.

#### Host placement

**Production should run on its own host**, not on the development workstation. Dev, smoke, and a prod-instance all bind the same `FRONTEND_PORT` (default 3330), so only one can listen at a time on a given machine. Running prod on the dev box means stopping it whenever you smoke-test or develop, which defeats the point of a persistent install.

A separate host can be anything that runs Docker: a Linux server, a NAS, a Raspberry Pi, a second workstation, a VM. The `deploy:local-prod` helper produces the same artifact either way - only the default `APPDATA_ROOT` / `BACKUPS_ROOT` paths change with platform.

#### Directory layout

The same `{root}/{slug}/` pattern is used, with `APPDATA_ROOT` and `BACKUPS_ROOT` split so backups can reside on different storage. Linux defaults:

```
/opt/appdata/                        # APPDATA_ROOT
├── spernakit/
│   ├── docker-compose.yml           # Copy of docker-compose.production.yml
│   ├── compose.vars                  # APP_SLUG, APP_IMAGE, APP_VERSION, ports, *_ROOT vars
│   ├── config/
│   │   └── spernakit.json           # Pre-authored: explicit allowedOrigins + secrets
│   ├── data/                        # Persistent SQLite database
│   └── logs/                        # Production logs
└── ...

/opt/backups/                        # BACKUPS_ROOT
├── spernakit/
│   └── spernakit_<timestamp>.db
└── ...
```

Windows defaults are `%ProgramData%\appdata\production\` and `%ProgramData%\backups\production\` - same shape, same `{root}/{slug}/` pattern, useful when prod genuinely is the dev box (short-lived dogfood, accepting the port-clash trade-off). Override either with `APPDATA_ROOT` / `BACKUPS_ROOT` or the `--appdata-root` / `--backups-root` flags.

#### Bootstrapping

The `bun run deploy:local-prod` helper scaffolds the deploy with all secrets pre-authored - no bootstrap-then-edit step. Run it from a checkout of the application on the target host:

```bash
bun run deploy:local-prod \
  --frontend-url http://your-domain.example:3330 \
  --allowed-origins http://your-domain.example:3330
```

The helper:

1. Verifies the selected image exists in the local Docker daemon. By default this is `<slug>-test:<version>`, built by `bun run docker:image:build`; use `--image` to select another image explicitly.
2. Creates the deploy directory tree under `APPDATA_ROOT` and `BACKUPS_ROOT`.
3. Writes `compose.vars`, copies `docker-compose.production.yml` into the deploy dir as `docker-compose.yml`.
4. Generates `config/<slug>.json` from `defaults.json` + EC P-256 JWT keypairs, AES-256-GCM encryption + backup-encryption keys, MFA keypair, cookie secret, application API key.
5. Sets `server.nodeEnv=production`, `server.trustProxy=true`, `server.trustedProxies=[Docker subnet ranges]`, `cors.allowedOrigins` to the values you supplied.
6. Refuses to overwrite an existing config (use `--rotate-secrets` for a destructive secret rotation).

Then:

```bash
cd /opt/appdata/spernakit       # or %ProgramData%\appdata\production\spernakit on Windows
docker compose --env-file compose.vars up -d
docker compose --env-file compose.vars logs -f
```

#### Cookie security gotcha

`security.cookieSecure=true` (the production default) requires HTTPS in front of the container. If you deploy to plain HTTP via the loopback bind (`127.0.0.1:<port>`), leave `--cookie-secure` off - the container still runs production code paths, but the auth cookie is sent over HTTP. For full production parity, front the deploy with a TLS proxy (Caddy + Let's Encrypt or mkcert) and pass both `--frontend-url https://...` and `--cookie-secure`.

#### Upgrading

Build the new local verification image, then update both `APP_IMAGE` and `APP_VERSION` in
`compose.vars` before restarting:

```bash
bun run docker:image:build
docker compose --env-file compose.vars up -d
```

The pre-authored config is preserved across version bumps; only the image tag changes.

#### Secrets file (optional)

Apps that need additional production secrets beyond what the helper generates (third-party API keys, OAuth credentials, SMTP passwords) can write a sibling `config/<slug>.secrets.json`. The schema mirrors the main config; values there override the main config at load time. Inject via env vars or a secrets manager rather than committing to the deploy host directly.

### Key Principles

| Principle                      | Why                                                                     |
| ------------------------------ | ----------------------------------------------------------------------- |
| **Physical separation**        | Each environment's data is in an independent directory tree; no nesting |
| **Consistent internal layout** | Every environment uses `{root}/{slug}/config\|data\|logs\|backups`      |
| **Drive-letter independence**  | No environment depends on a Windows drive letter mapping                |
| **Secret isolation**           | Each environment has its own secrets; no shared cryptographic material  |
| **Production mirroring**       | Staging layout mirrors production so restore drills are faithful        |

---

## Pre-Deployment Checklist

Work through these before deploying to production:

### **Code Quality**

- [ ] Full quality gate passes (`bun run smoke:qc`)
- [ ] No TypeScript errors (`bun run typecheck`)
- [ ] Code passes linting (`bun run lint`)
- [ ] Build succeeds (`bun run build`)

### **Security**

- [ ] Changed all default passwords
- [ ] Generated secure JWT secrets (32+ characters)
- [ ] Configured proper CORS origins
- [ ] Reviewed and updated JSON configuration
- [ ] Enabled HTTPS/SSL certificates

### **Database**

- [ ] Production database configured
- [ ] Migrations applied
- [ ] Backup strategy implemented
- [ ] Connection pooling configured

### **Infrastructure**

- [ ] Server resources adequate (CPU, RAM, storage)
- [ ] Load balancer configured (if needed)
- [ ] CDN setup for static assets (if needed)
- [ ] Monitoring and alerting configured

---

## Environment Configuration

### **Production Configuration (JSON - Recommended)**

Spernakit uses **JSON configuration files** for production deployments. This keeps the config consistent with Docker and gives it a defined structure.

Create `config/{appname}.json` with production settings:

```json
{
	"app": {
		"description": "Production application description",
		"name": "Your Production App",
		"slug": "your-app"
	},
	"cors": {
		"frontendDevOrigins": ["https://your-domain.com", "https://www.your-domain.com"]
	},
	"database": {
		"url": "file:./data/your-app.db"
	},
	"email": {
		"from": "noreply@your-domain.com",
		"host": "smtp.your-provider.com",
		"pass": "your-email-password",
		"port": 587,
		"secure": true,
		"user": "your-email@your-domain.com"
	},
	"rateLimit": {
		"enabled": true,
		"maxRequests": 100,
		"windowMs": 900000
	},
	"security": {
		"applicationApiKey": "your-48-character-api-key",
		"authCookieName": "your_app_token",
		"bcryptRounds": 12,
		"cookieSecret": "your-32-character-cookie-secret",
		"encryptionKey": "your-64-character-hex-encryption-key",
		"jwtPrivateKey": "-----BEGIN PRIVATE KEY-----\n...",
		"jwtPublicKey": "-----BEGIN PUBLIC KEY-----\n...",
		"jwtRefreshPrivateKey": "-----BEGIN PRIVATE KEY-----\n...",
		"jwtRefreshPublicKey": "-----BEGIN PUBLIC KEY-----\n..."
	},
	"server": {
		"backendPort": 3331,
		"frontendPort": 3330,
		"frontendUrl": "https://your-domain.com",
		"host": "0.0.0.0",
		"nodeEnv": "production",
		"trustProxy": true
	}
}
```

**Generate secure keys:**

```bash
# Generate all security keys automatically
bun run generate-keys

# This will update config/{appname}.json with cryptographically secure keys
```

### **Production Configuration**

Create a production-specific JSON config file:

```bash
# Copy your development config as a starting point
cp config/myapp.json config/myapp.production.json

# Edit production settings
# Set NODE_ENV=production in your deployment environment

# Update values in JSON:
# - server.frontendUrl / server.backendUrl
# - cors.frontendDevOrigins
# - database.url (SQLite/libSQL)
# - email settings
```

### **Security Best Practices**

```bash
# Generate secure secrets for production
bun run generate-keys

# Use environment-specific config files
config/myapp.json            # Development settings
config/myapp.production.json # Production settings
config/myapp.staging.json    # Staging settings
```

**Configuration Management:**

- Store production config securely (not in version control)
- Use environment variables for sensitive values in CI/CD
- Mount config files as secrets in Docker/Kubernetes
- Rotate security keys regularly

---

## Docker Deployment (Recommended)

### **Using Docker Compose**

1. **Build and Deploy**

```bash
# Create a Compose variable file outside the source tree.
cat > compose.vars <<'EOF'
APP_SLUG=spernakit
APP_IMAGE=spernakit-test:3.21.0
APP_VERSION=3.21.0
FRONTEND_PORT=3330
BACKEND_PORT=3331
APPDATA_ROOT=/opt/appdata
BACKUPS_ROOT=/opt/backups
NODE_ENV=production
EOF

# Build and start services
docker compose --env-file compose.vars -f docker-compose.production.yml up -d

# View logs
docker compose --env-file compose.vars -f docker-compose.production.yml logs -f

# Stop services
docker compose --env-file compose.vars -f docker-compose.production.yml down
```

2. **Production Docker Compose**

Spernakit ships a **monolithic container** - a single image runs nginx (frontend + API proxy) and the Elysia backend under supervisord. Only port 3330 is exposed:

```yaml
# docker-compose.production.yml
# Required env vars: APP_SLUG, APP_IMAGE, APP_VERSION, APPDATA_ROOT, BACKUPS_ROOT
# Optional env vars: FRONTEND_PORT (3330), BACKEND_PORT (3331), NODE_ENV (production)
services:
    spernakit:
        image: '${APP_IMAGE:?APP_IMAGE is required}'
        container_name: ${APP_SLUG:?APP_SLUG is required}
        ports:
            - '127.0.0.1:${FRONTEND_PORT:-3330}:${FRONTEND_PORT:-3330}'
        volumes:
            - ${APPDATA_ROOT:?APPDATA_ROOT is required}/${APP_SLUG}/config:/app/config
            - ${APPDATA_ROOT}/${APP_SLUG}/data:/app/data
            - ${APPDATA_ROOT}/${APP_SLUG}/logs:/app/logs
            - ${BACKUPS_ROOT:?BACKUPS_ROOT is required}/${APP_SLUG}:/app/backups
        environment:
            - BACKEND_PORT=${BACKEND_PORT:-3331}
            - FRONTEND_PORT=${FRONTEND_PORT:-3330}
            - NODE_ENV=${NODE_ENV:-production}
        restart: unless-stopped
        stop_grace_period: 30s
        security_opt:
            - no-new-privileges:true
        cap_drop:
            - ALL
        read_only: true
        tmpfs:
            - /tmp:uid=1000,gid=1000
            - /var/log/nginx:uid=1000,gid=1000
            - /var/log/supervisor:uid=1000,gid=1000
            - /run/nginx:uid=1000,gid=1000
            - /var/lib/nginx:uid=1000,gid=1000
        healthcheck:
            test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:${FRONTEND_PORT:-3330}/api/v1/health']
            interval: 30s
            timeout: 10s
            retries: 3
            start_period: 45s
        deploy:
            resources:
                limits:
                    memory: 512M
                    cpus: '1.0'
        logging:
            driver: json-file
            options:
                max-file: '5'
                max-size: 10m

# No external database container needed - SQLite is embedded.
# nginx routes /api/* and /ws to the internal Elysia backend on port 3331.
# Always select an immutable or explicitly versioned APP_IMAGE. The template builds local
# verification images and does not publish them to a registry.
```

### Container Security Posture

What `docker-compose.production.yml` actually ships, and why each directive matters:

- `ports: 127.0.0.1:…` - loopback-only port binding. The container is unreachable from other host interfaces; all external traffic must come through the edge reverse proxy (see [Reverse Proxy and TLS](#ssl-https-setup)). This narrows the attack surface from "every host NIC" to "localhost only."
- `read_only: true` + `tmpfs:` - the container rootfs is immutable; only the listed tmpfs mounts (and volume mounts) are writable. The tmpfs mounts are `/tmp`, `/var/log/nginx`, `/var/log/supervisor`, `/run/nginx`, and `/var/lib/nginx` (all `uid=1000,gid=1000`). This stops persistent tampering if an attacker gets RCE inside the container.
- `security_opt: [no-new-privileges:true]` + `cap_drop: [ALL]` - the process cannot gain privileges via setuid binaries and starts with zero Linux capabilities. This shrinks the kernel-privilege blast radius.
- `stop_grace_period: 30s` - gives supervisord/nginx/Elysia time to drain in-flight requests and close the SQLite file cleanly before Docker sends SIGKILL.
- `healthcheck:` - probes `http://127.0.0.1:${FRONTEND_PORT}/api/v1/health` (unauthenticated, minimal payload) every 30s. supervisord restarts failed processes inside the container, but Docker/Compose only restart an unhealthy container when a healthcheck is declared. Without it, a wedged-but-running container is invisible to orchestrators.
- `${APP_IMAGE:?…}` - the image reference is required; compose never guesses a registry or publisher. Spernakit's verification build produces `<slug>-test:<version>` locally.
- `deploy.resources.limits` - caps memory/CPU so a runaway request or memory leak cannot starve neighbors on the same host.
- `logging.options` - `json-file` with `max-file` + `max-size` caps Docker's log ring buffer. Without it, `docker logs` can grow without bound and fill the host disk (see [audit-deployment-1776984102-pino-file-no-rotation], tracked separately for pino file logs).

Keep these directives when copying into your own repo. If one genuinely does not apply (say, you already run behind a Docker-internal network and the loopback bind is redundant), document the exception in the derived app's `docs/` - never silently drop container hardening.

**Local verification tags.** `bun run docker:image:build` creates `<slug>-test:latest` and
`<slug>-test:<package.version>` in the current Docker daemon. Neither tag is pushed or exported.

Spernakit deliberately provides no registry publishing workflow. A derived project may add one
only as an explicit owner decision. Before distributing an image, that project must replace the
template guidance with its own image-retention, third-party notice, corresponding-source, and
rollback policy; see [`licenses/CONTAINER-DISTRIBUTION.md`](../../licenses/CONTAINER-DISTRIBUTION.md).

### **Building the Docker Image**

```bash
# Build via docker compose (local dev)
bun run docker:build

# Build the standalone production image
bun run docker:image:build
```

### **Refreshing the Bun Base Image Digest**

The root `Dockerfile` pins `oven/bun:1.3.14-alpine` with an OCI index digest in both
the `base-builder` and `production` stages. When the Bun version changes, refresh the
digest in the same commit:

```bash
docker buildx imagetools inspect oven/bun:<new-version>-alpine
```

Use the top-level `Digest:` value from that output, not a platform-specific manifest
digest, so the Dockerfile remains multi-architecture. Update both `FROM` lines to the
same `oven/bun:<new-version>-alpine@sha256:<digest>` value, then run:

```bash
bun run docker:image:build
bun run smoke:docker-prod
```

---

## Rollback and Recovery

Every production deployment must have a documented rollback path. This section is the canonical runbook - cross-linked from [Docker Deployment](#docker-deployment-recommended) above and from `SECURITY.md`. Derived apps inherit this runbook; do not delete it when forking the template.

### **1. Image-tag rollback (bad code, good data)**

Use when a deployment introduces a regression but the database is healthy.

```bash
# 1. Select a previous known-good local image and re-deploy.
export APP_IMAGE=my-app-test:3.13.0
export APP_VERSION=3.13.0
docker compose -f docker-compose.production.yml up -d

# 2. Confirm health.
curl -sf http://127.0.0.1:3330/api/v1/health | jq .
docker compose ps
```

This relies on retaining every image referenced by a deployment. Spernakit keeps verification
images local and does not promise registry availability. A derived project's owner chooses and
operates any remote registry, including its retention and license-compliance policy.

### **2. Database restore from backup (bad data)**

Use when the database is corrupted, accidentally wiped, or a migration cannot be forward-rolled.

**Preferred - admin UI:**

1. Log in as a SYSOP user.
2. Navigate to **Settings → Backups**.
3. Select the target backup, click **Restore**, confirm.
4. The service verifies the backup integrity, restores the SQLite file, and restarts the backend.

**REST API (for scripted runbooks):**

```bash
# Authenticate as a SYSOP user, then:
curl -X POST https://your-domain.com/api/v1/system/backup/restore \
  -H "Authorization: Bearer $SYSOP_JWT" \
  -H "Content-Type: application/json" \
  -d '{"backupId": "<backup-uuid>"}'
```

See the implementation in `backend/src/services/backup/backupRestore.ts` and the OpenAPI spec at `/api/v1/docs` for the full contract.

> **Encryption key must match.** If `database.backup.encrypt` is `true`, the restore path decrypts with `security.encryptionKey`. Rotating the encryption key makes older encrypted backups unrecoverable. Before rotating, take a fresh unencrypted snapshot or re-encrypt existing backups with the new key.

**CLI fallback (container down, no auth path, disaster recovery):**

```bash
# 1. Stop the container so the SQLite file is closed cleanly.
docker compose -f docker-compose.production.yml down

# 2. Copy the backup into the data volume. Replace paths with your APPDATA_ROOT / BACKUPS_ROOT.
cp "${BACKUPS_ROOT}/${APP_SLUG}/your-app_20260423_020000.db" \
   "${APPDATA_ROOT}/${APP_SLUG}/data/your-app.db"

# IMPORTANT: exclude WAL/SHM sidecars from the copy - they belong to a different DB
# generation and will corrupt the restored database if present.
rm -f "${APPDATA_ROOT}/${APP_SLUG}/data/your-app.db-wal" \
      "${APPDATA_ROOT}/${APP_SLUG}/data/your-app.db-shm"

# 3. Bring the stack back up.
docker compose -f docker-compose.production.yml up -d
curl -sf http://127.0.0.1:3330/api/v1/health
```

### **3. Incident-response runbook**

When a production alert fires or a user reports an outage:

1. **Confirm impact.** `curl -sf https://your-domain.com/api/v1/health`; open the admin **Metrics** page; check the uptime/error-rate charts.
2. **Capture evidence before mutating state.**

    ```bash
    docker logs --tail 200 "$APP_SLUG"                         > /tmp/incident-docker.log
    docker exec "$APP_SLUG" tail -n 200 /app/logs/app.log       > /tmp/incident-app.log
    ```

3. **Decide the recovery path.**
    - Error rate > 5 % **or** `/api/v1/health` failing → execute **image-tag rollback** (§1).
    - Data corruption / missing rows → execute **database restore** (§2).
    - Both → rollback first, restore second (rollback is faster and may be sufficient).
4. **Verify.** Re-run the health check and spot-check the most recently affected user-facing flow.
5. **File an incident note** in `.aidd/CHANGELOG.md` under today's date: include the failing tag, the symptom, the chosen remediation, the recovered tag/backup, and any follow-up work.

### **Restore Drill**

Run a **quarterly restore drill** against staging to prove the runbook works before you need it:

1. Take a fresh production backup.
2. Restore it into a staging instance using the CLI fallback path (§2).
3. Run `bun run smoke:qc` against the restored staging.
4. Record the drill date and outcome in the admin UI (**Settings → Backups → Drill Log**) and in `.aidd/CHANGELOG.md`.

---

## Manual Deployment

### **Backend Deployment**

```bash
# On your production server
cd /path/to/your/app

# Install production dependencies
bun install --production

# Run database migrations
bun run db:migrate

# Build application
bun run build

# Start directly with Bun
bun run start
```

### **Frontend Deployment**

```bash
# Build frontend
cd /path/to/your/app/frontend
bun install
bun run build

# Serve with nginx (recommended)
sudo cp -r dist/* /var/www/html/

# Or serve with a static file server
bunx serve -s dist -l 3330
```

### **Nginx Configuration (Edge Reverse Proxy)**

> **The container already terminates HTTP on port 3330 and applies its own CSP, rate-limit, and defense-in-depth headers** (see `docker/nginx.conf`). The edge proxy's responsibility is exclusively **TLS termination, HSTS, and HTTP→HTTPS redirect**.
>
> - **Proxy to `127.0.0.1:3330`** (the container's public nginx port), NEVER to `3331` (the internal Elysia backend). Targeting `3331` bypasses the in-container nginx layer and its CSP/rate-limit/security headers.
> - **Do NOT duplicate or relax the container CSP** at the edge - `docker/nginx.conf` owns that policy. Edge CSP injection typically results in browsers seeing two CSP headers and applying the intersection, which silently breaks new features on upgrade.
> - For auto-TLS alternatives (Let's Encrypt handled by the proxy itself), see [`docker/examples/caddy/Caddyfile`](../../docker/examples/caddy/Caddyfile) and [`docker/examples/traefik/docker-compose.yml`](../../docker/examples/traefik/docker-compose.yml).

```nginx
# /etc/nginx/sites-available/your-app
# HTTP → HTTPS redirect only. No other content served on :80.
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

# TLS-terminating server. Proxies all traffic to the container on 127.0.0.1:3330.
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;

    # TLS certificates (e.g., from certbot --nginx or your own CA)
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Edge security headers. `always` ensures they are applied to error responses too.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Proxy everything (frontend + /api + /ws) to the container's public port.
    location / {
        proxy_pass http://127.0.0.1:3330;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }

    # WebSocket upgrade path - same upstream, plus Upgrade/Connection headers.
    location /ws {
        proxy_pass http://127.0.0.1:3330;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
```

After reloading nginx, verify end-to-end:

```bash
curl -sI http://your-domain.com             # → HTTP/1.1 301 Moved Permanently
curl -sI https://your-domain.com            # → HTTP/2 200 + Strict-Transport-Security header
curl -sf https://your-domain.com/api/v1/health   # → {"status":"ok",...}
```

---

## Database Setup

### **SQLite/libSQL (Default)**

Spernakit uses a SQLite/libSQL database by default. Configure it in `config/{appname}.json`:

```json
{
	"database": {
		"url": "file:./data/your-app.db"
	}
}
```

### **Database Schema Management**

```bash
# Generate a new migration after schema changes
bun run db:generate

# Apply migrations (safe, transaction-wrapped)
bun run db:migrate

# Seed database with default data
bun run --cwd backend db:seed
```

### **Database Backup Strategy**

```bash
# Create backup script
#!/bin/bash
# backup-db.sh
DATE=$(date +%Y%m%d_%H%M%S)
cp ./data/your-app.db "/backups/your-app_$DATE.db"

# Schedule with cron
crontab -e
# Add: 0 2 * * * /path/to/backup-db.sh
```

---

## Security Configuration

### **Environment Variables for Secrets**

In production deployments (Docker, Kubernetes), inject security secrets via environment variables rather than storing them in config files. The config loader derives env var names from your app's slug (`app.slug` in `defaults.json`), uppercased with hyphens replaced by underscores:

| Environment Variable                   | Config Path                     | Description                           |
| -------------------------------------- | ------------------------------- | ------------------------------------- |
| `{SLUG_UPPER}_JWT_PRIVATE_KEY`         | `security.jwtPrivateKey`        | EC P-256 private key (PEM)            |
| `{SLUG_UPPER}_JWT_PUBLIC_KEY`          | `security.jwtPublicKey`         | EC P-256 public key (PEM)             |
| `{SLUG_UPPER}_JWT_REFRESH_PRIVATE_KEY` | `security.jwtRefreshPrivateKey` | EC P-256 refresh private key (PEM)    |
| `{SLUG_UPPER}_JWT_REFRESH_PUBLIC_KEY`  | `security.jwtRefreshPublicKey`  | EC P-256 refresh public key (PEM)     |
| `{SLUG_UPPER}_COOKIE_SECRET`           | `security.cookieSecret`         | Cookie signing secret (min 32 chars)  |
| `{SLUG_UPPER}_ENCRYPTION_KEY`          | `security.encryptionKey`        | Data encryption key (64 hex chars)    |
| `{SLUG_UPPER}_API_KEY`                 | `security.applicationApiKey`    | API authentication key (min 32 chars) |

For an app with slug `spernakit`, the variables are `SPERNAKIT_JWT_PRIVATE_KEY`, `SPERNAKIT_COOKIE_SECRET`, etc. For slug `my-app`, they become `MY_APP_JWT_PRIVATE_KEY`, etc.

**Docker Compose Example:**

```yaml
services:
    spernakit:
        image: '${APP_IMAGE:?APP_IMAGE is required}'
        environment:
            - SPERNAKIT_JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
            - SPERNAKIT_JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...
            - SPERNAKIT_JWT_REFRESH_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
            - SPERNAKIT_JWT_REFRESH_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...
            - SPERNAKIT_COOKIE_SECRET=your-secure-cookie-secret-min-32-characters
            - SPERNAKIT_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
            - SPERNAKIT_API_KEY=your-secure-api-key-min-48-characters
```

**Kubernetes Example:**

```yaml
apiVersion: v1
kind: Secret
metadata:
    name: spernakit-secrets
type: Opaque
stringData:
    SPERNAKIT_JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\n...'
    SPERNAKIT_JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\n...'
    SPERNAKIT_JWT_REFRESH_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\n...'
    SPERNAKIT_JWT_REFRESH_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\n...'
    SPERNAKIT_COOKIE_SECRET: 'your-secure-cookie-secret'
    SPERNAKIT_ENCRYPTION_KEY: '0123456789abcdef...'
    SPERNAKIT_API_KEY: 'your-secure-api-key'
```

**Generating Secure Secrets:**

```bash
# Generate all secrets automatically
bun run generate-keys

# Or generate individual secrets with OpenSSL
openssl rand -base64 48  # For JWT secrets
openssl rand -hex 32     # For encryption key
```

### **SSL/HTTPS Setup**

The Spernakit Docker container runs nginx in HTTP-only mode by design. An external reverse proxy or load balancer in front of the container handles TLS termination. This means:

- **Separation of concerns**: TLS management stays out of the application
- **Flexibility**: Pick any reverse proxy that fits your infrastructure
- **Auto-TLS**: Proxies like Caddy or Traefik provision and renew certificates for you

#### **Container Architecture**

```
[Client] --HTTPS--> [Reverse Proxy] --HTTP--> [Spernakit Container :3330]
                            (TLS termination)        (nginx + backend)
```

The nginx instance inside the container listens on the configured port (default 3330) and serves HTTP traffic. The backend still applies security headers like HSTS, but they only matter once traffic reaches the client over HTTPS.

#### **Recommended Reverse Proxy Options**

**Option 1: Caddy (Recommended for Auto-TLS)**

Caddy automatically provisions and renews Let's Encrypt certificates:

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.gz' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Example Caddyfile (`/etc/caddy/Caddyfile`):

```caddy
your-domain.com {
    reverse_proxy localhost:3330
}
```

**Option 2: Traefik**

Traefik integrates well with Docker and provides automatic certificate management:

```yaml
# docker-compose.traefik.yml
version: '3.8'
services:
    traefik:
        image: traefik:v2.10
        command:
            - '--api.insecure=true'
            - '--providers.docker=true'
            - '--entrypoints.websecure.address=:443'
            - '--certificatesresolvers.myresolver.acme.tlschallenge=true'
            - '--certificatesresolvers.myresolver.acme.email=your-email@example.com'
            - '--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json'
        ports:
            - '443:443'
        volumes:
            - '/var/run/docker.sock:/var/run/docker.sock:ro'
            - './letsencrypt:/letsencrypt'
```

**Option 3: Nginx Proxy Manager**

For a web UI, Nginx Proxy Manager manages reverse proxy configurations and SSL certificates through a browser interface.

Visit: https://nginxproxymanager.com/

#### **Example Configurations**

See the `docker/examples/` directory for ready-to-use reverse proxy configurations:

- `docker/examples/caddy/Caddyfile` - Caddy configuration with auto-TLS
- `docker/examples/traefik/docker-compose.yml` - Traefik setup with Let's Encrypt

#### **Important: Secure Cookies**

When deploying behind HTTPS, ensure your configuration has `cookieSecure` set to `true`:

```json
{
	"security": {
		"cookieSecure": true
	}
}
```

The application logs a startup warning if HSTS headers are enabled while `cookieSecure` is `false` - that combination is a security misconfiguration.

#### **Traditional Setup (Direct nginx)**

If you're running nginx directly on the host (not in a container) and want to handle TLS at the nginx level:

```bash
# Using Let's Encrypt with Certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### **Firewall Configuration**

```bash
# Configure UFW (Ubuntu)
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### **Security Headers**

Security headers are implemented via the `securityHeadersPlugin` Elysia plugin in `backend/src/plugins/securityHeaders.ts`. This plugin automatically adds CSP, HSTS, and other security headers to all responses.

---

## Monitoring & Logging

### **Application Monitoring**

The `logger` utility in `backend/src/utils/logger.ts` handles logging. It uses Pino for structured JSON logging with file rotation, is configured via JSON config, and writes leveled output to the console and rotating log files.

### **Health Checks**

```bash
# Create health check script
#!/bin/bash
# health-check.sh
curl -f http://localhost:3331/api/v1/health || exit 1
curl -f http://localhost:3330 || exit 1
```

### **Process Management**

The Elysia backend runs directly under Bun. For production, use Docker with supervisord (included in the monolithic container), or a process manager like systemd:

```bash
# Direct start
bun run start

# Or via Docker
bun run docker:up
```

---

## Troubleshooting

### **Common Deployment Issues**

**Port binding errors:**

```bash
# Check what's using the port
sudo lsof -i :3331
sudo kill -9 <PID>
```

**Database connection issues:**

```bash
# Test database connection
ls -la ./data
```

**Permission errors:**

```bash
# Fix file permissions
sudo chown -R www-data:www-data /var/www/html
sudo chmod -R 755 /var/www/html
```

**Memory issues:**

```bash
# Check memory usage
free -h
# Increase swap if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## Additional Resources

- [**Troubleshooting Guide**](TROUBLESHOOTING.md) - Common issues and solutions
- [**Security Best Practices**](SECURITY.md) - Security guide
- [**Developer Guide**](DEVELOPMENT.md) - Development patterns and practices

---

If a deployment step fails, start with the [Troubleshooting Guide](TROUBLESHOOTING.md).
