#!/bin/sh
set -e

# Allow docker stop to cleanly abort during init phase
trap 'echo "Aborting init"; exit 1' SIGTERM SIGINT

# Default port values
export BACKEND_PORT="${BACKEND_PORT:-3331}"
export FRONTEND_PORT="${FRONTEND_PORT:-3330}"
export CLIENT_MAX_BODY_SIZE="${CLIENT_MAX_BODY_SIZE:-10m}"

# Create nginx subdirectories in tmpfs mounts
mkdir -p /var/lib/nginx/logs /var/lib/nginx/tmp

# Substitute environment variables in nginx config
envsubst '${BACKEND_PORT} ${FRONTEND_PORT} ${CLIENT_MAX_BODY_SIZE}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf

# Validate nginx config
nginx -t -c /tmp/nginx.conf || { echo "❌ nginx config validation failed"; exit 1; }

# Ensure data directories exist
mkdir -p /app/data /app/logs /app/backups

# Discover app slug from defaults.json (single source of truth)
DEFAULTS_FILE="/app/backend/src/config/defaults.json"
APP_SLUG=$(bun -e "console.log(JSON.parse(require('fs').readFileSync('$DEFAULTS_FILE','utf8')).app.slug)")
CONFIG_FILE="/app/config/${APP_SLUG}.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "No config found. Creating from defaults..."
    cp "$DEFAULTS_FILE" "$CONFIG_FILE"

    echo "Generating secure keys..."
    bun -e "
const fs = require('fs');
const crypto = require('crypto');
const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
const genKeyPair = () => crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
});
const jwtKeys = genKeyPair();
const refreshKeys = genKeyPair();
const mfaKeys = genKeyPair();
config.security.jwtPrivateKey = jwtKeys.privateKey;
config.security.jwtPublicKey = jwtKeys.publicKey;
config.security.jwtRefreshPrivateKey = refreshKeys.privateKey;
config.security.jwtRefreshPublicKey = refreshKeys.publicKey;
config.security.mfaPrivateKey = mfaKeys.privateKey;
config.security.mfaPublicKey = mfaKeys.publicKey;
config.security.encryptionKey = crypto.randomBytes(32).toString('hex');
config.security.backupEncryptionKey = crypto.randomBytes(32).toString('hex');
config.security.cookieSecret = crypto.randomBytes(32).toString('hex');
config.security.applicationApiKey = crypto.randomBytes(48).toString('base64url');
config.server.trustProxy = true;
config.server.trustedProxies = ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16'];
config.server.nodeEnv = process.env.NODE_ENV || 'production';
const stgMarker = '/app/config/.stg-bootstrap';
if (fs.existsSync(stgMarker)) {
    config.cors.inheritFrontendUrl = true;
    config.cors.frontendDevOrigins = [];
    fs.unlinkSync(stgMarker);
    console.log('Applied STG bootstrap overrides from marker');
}
fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, '\t'));
console.log('Generated: EC P-256 JWT and MFA key pairs, encryptionKey, backupEncryptionKey, cookieSecret, applicationApiKey');
"
    # Validate key generation produced a non-empty config
    if [ ! -s "$CONFIG_FILE" ]; then
        echo "❌ Key generation failed: config file is empty"
        exit 1
    fi

    chmod 400 "$CONFIG_FILE" 2>/dev/null || true
    echo "Config created at $CONFIG_FILE"
else
    echo "Config found at $CONFIG_FILE"
fi

# Lock down config file after initial read
chmod 400 "$CONFIG_FILE" 2>/dev/null || true

# Pre-migration database backup (SQLite DDL auto-commits prevent reliable rollback)
# Default DB file derives from APP_SLUG discovered above so downstream apps with
# their own slug (e.g. your-app) don't silently skip the backup step.
DB_FILE="${DB_FILE:-/app/data/${APP_SLUG}.db}"
if [ -f "$DB_FILE" ]; then
    BACKUP_FILE="${DB_FILE}.pre-migrate.$(date +%Y%m%d%H%M%S).bak"
    if cp "$DB_FILE" "$BACKUP_FILE"; then
        echo "Pre-migration backup: $BACKUP_FILE"
    else
        echo "⚠ Pre-migration backup failed (proceeding anyway)"
    fi
fi

# Run database migrations (with retry for transient failures)
MAX_RETRIES=3
RETRY=0
until cd /app && bun run db:migrate; do
    RETRY=$((RETRY + 1))
    if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
        echo "❌ Migration failed after $MAX_RETRIES attempts. Refusing to start with mismatched schema."
        echo "   Manual intervention required: docker exec <container> bun run db:migrate"
        exit 1
    fi
    echo "⚠ Migration attempt $RETRY/$MAX_RETRIES failed, retrying in 2s..."
    sleep 2
done

# Seed database on first run
if [ ! -f /app/data/.seeded ]; then
    echo "Seeding database..."
    if cd /app && bun run --cwd backend db:seed; then
        touch /app/data/.seeded
        echo "Database seeded successfully"
    else
        echo "⚠ WARNING: Database seed failed. Default accounts may not exist."
        echo "  Re-run seed manually: docker exec <container> bun run --cwd backend db:seed"
    fi
fi

# Start supervisord (manages nginx + backend)
exec supervisord -c /etc/supervisord.conf
