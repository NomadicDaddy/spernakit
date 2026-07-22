# Configuration Guide

This guide explains Spernakit's configuration system and how to manage application settings.

## Table of Contents

1. [Configuration Method](#configuration-method)
2. [JSON Configuration](#json-configuration)
3. [Security Keys](#security-keys)
4. [Configuration Schema](#configuration-schema)
5. [Environment-Specific Configuration](#environment-specific-configuration)
6. [Troubleshooting](#troubleshooting)

---

## Configuration Method

Spernakit uses **JSON configuration files** as the single source of truth for all configuration.

### Why JSON Config?

One file holds every setting, and the same format works for development and Docker
deployments. The loader validates the config against a schema and fills in defaults, so
typos surface at startup instead of at runtime. Config changes are also easy to track in
version control, as long as you keep secrets out of committed files.

### No `.env` Files

Spernakit **does not use `.env` files**. Bun's automatic `.env` loading is disabled via `bunfig.toml`:

```toml
# Disable automatic .env file loading
env = false
```

With that disabled, every setting comes from the JSON config. Bun never picks up a stray
`.env` file, so there is no accidental `.env` usage in any environment.

---

## JSON Configuration

### Location

Configuration files are stored in the `config/` directory:

```
config/
├── {appname}.json          # Your application config
└── {appname}.json.backup.* # Automatic backups
```

### Quick Start

**Option 1: Automated Setup**

```bash
# Run interactive setup
bun run setup

# This creates config/{appname}.json with:
# - Your app name, slug, and description
# - Custom ports
# - Secure cryptographic keys
```

**Option 2: Generate from Defaults**

```bash
# Generate config with secure keys
bun run generate-keys

# Edit config/{appname}.json as needed
```

**Option 3: Manual Creation**

```bash
# Copy defaults
cp backend/src/config/defaults.json config/myapp.json

# Generate secure keys
bun run generate-keys

# Edit config/myapp.json
```

### Configuration File Structure

```json
{
	"_comment": "Application configuration - DO NOT commit with production secrets!",

	"app": {
		"description": "My awesome application",
		"name": "My Application",
		"slug": "myapp"
	},

	"audit": {
		"enabled": true,
		"ipWhitelist": ["127.0.0.1", "::1"]
	},

	"cors": {
		"allowNoOrigin": false,
		"allowedOrigins": [],
		"frontendDevOrigins": ["http://localhost:3330"]
	},

	"database": {
		"allowDbPush": false,
		"backup": {
			"compress": false,
			"enabled": true,
			"encrypt": true,
			"intervalHours": 24,
			"location": "./backups",
			"retentionDays": 30
		},
		"dialect": "sqlite",
		"integrityCheck": {
			"enabled": true,
			"intervalHours": 6,
			"mode": "quick"
		},
		"ssl": {
			"enabled": false,
			"rejectUnauthorized": true
		},
		"url": "file:./data/spernakit.db",
		"vacuum": {
			"enabled": true,
			"intervalHours": 24
		}
	},

	"email": {
		"retryAttempts": 2,
		"retryDelayMs": 1000
	},

	"healthCheck": {
		"enabled": true,
		"interval": 300,
		"retentionDays": 30,
		"thresholds": {
			"auth": { "critical": 500, "warn": 100 },
			"db": { "critical": 500, "warn": 100 },
			"fs": { "critical": 200, "warn": 50 },
			"memory": { "critical": 95, "warn": 90 }
		}
	},

	"metrics": {
		"collectionIntervalMs": 60000
	},

	"oauth": {
		"github": {
			"callbackUrl": "",
			"clientId": "",
			"clientSecret": "",
			"enabled": false
		},
		"google": {
			"callbackUrl": "",
			"clientId": "",
			"clientSecret": "",
			"enabled": false
		},
		"microsoft": {
			"callbackUrl": "",
			"clientId": "",
			"clientSecret": "",
			"enabled": false,
			"tenantId": "common"
		}
	},

	"rateLimit": {
		"authEnabled": true,
		"enabled": true,
		"maxRequests": 100,
		"windowMs": 900000
	},

	"roles": {
		"ADMIN": {
			"description": "Application administration, user management",
			"label": "Administrator"
		},
		"MANAGER": {
			"description": "Team and workspace member management",
			"label": "Manager"
		},
		"OPERATOR": {
			"description": "Standard operations, data entry and modification",
			"label": "Operator"
		},
		"SYSOP": {
			"description": "System administration, cross-workspace access",
			"label": "System Operator"
		},
		"VIEWER": {
			"description": "Read-only access to permitted resources",
			"label": "Viewer"
		}
	},

	"security": {
		"applicationApiKey": "your-48-character-api-key",
		"authCookieName": "myapp_token",
		"bcryptRounds": 12,
		"cookieMaxAge": 900000,
		"cookieSecret": "your-32-character-cookie-secret",
		"encryptionKey": "your-64-character-hex-encryption-key",
		"jwtExpiresIn": "15m",
		"jwtPrivateKey": "-----BEGIN PRIVATE KEY-----\n...",
		"jwtPublicKey": "-----BEGIN PUBLIC KEY-----\n...",
		"jwtRefreshExpiresIn": "7d",
		"jwtRefreshPrivateKey": "-----BEGIN PRIVATE KEY-----\n...",
		"jwtRefreshPublicKey": "-----BEGIN PUBLIC KEY-----\n..."
	},

	"server": {
		"backendPort": 3331,
		"frontendPort": 3330,
		"frontendUrl": "http://localhost:3330",
		"host": "0.0.0.0",
		"nodeEnv": "production",
		"timezone": "UTC",
		"trustProxy": false
	},

	"storage": {
		"adapter": "local",
		"allowedMimeTypes": [
			"image/jpeg",
			"image/png",
			"image/gif",
			"image/webp",
			"application/pdf",
			"text/plain",
			"text/csv",
			"application/json"
		],
		"maxFileSize": 10485760,
		"s3": {
			"accessKeyId": "",
			"bucket": "",
			"endpoint": "",
			"region": "",
			"secretAccessKey": ""
		}
	},

	"testing": {
		"crawlContentMinLength": 50,
		"crawlInteractionDelay": 400,
		"crawlLoginEmail": "sysop@example.com",
		"crawlLoginPassword": "",
		"crawlMaxDepth": 6,
		"crawlPageSettleDelay": 500,
		"crawlTimeout": 30000
	},

	"tokenCleanup": {
		"enabled": true,
		"intervalHours": 6,
		"minimumIntervalHours": 1
	},

	"websocket": {
		"maxConnectionsPerIp": 50,
		"maxConnectionsPerUser": 10,
		"maxPayload": 1048576,
		"rateLimitWindow": 60000
	}
}
```

---

## Security Keys

### Generating Secure Keys

**Automatic Generation:**

```bash
# Generate all security keys
bun run generate-keys

# This generates:
# - jwtPrivateKey / jwtPublicKey (EC P-256 key pair, PEM format)
# - jwtRefreshPrivateKey / jwtRefreshPublicKey (EC P-256 key pair, PEM format)
# - encryptionKey (64 hex characters)
# - cookieSecret (32 characters)
# - applicationApiKey (48 characters)
```

**Key Requirements:**

| Key                    | Format                   | Purpose                    |
| ---------------------- | ------------------------ | -------------------------- |
| `jwtPrivateKey`        | EC P-256 PEM private key | JWT token signing (ES256)  |
| `jwtPublicKey`         | EC P-256 PEM public key  | JWT token verification     |
| `jwtRefreshPrivateKey` | EC P-256 PEM private key | Refresh token signing      |
| `jwtRefreshPublicKey`  | EC P-256 PEM public key  | Refresh token verification |
| `encryptionKey`        | 64 hex chars             | Data encryption (AES-256)  |
| `cookieSecret`         | 32+ chars                | Cookie signing             |
| `applicationApiKey`    | 48+ chars                | API authentication         |

### Key Rotation

**WARNING: Key rotation invalidates existing data!**

- All user sessions will be logged out
- Encrypted data becomes unreadable
- Requires application restart

**Production Key Rotation:**

```bash
# 1. Backup current config
cp config/myapp.json config/myapp.json.backup

# 2. Export/backup encrypted data (if any)

# 3. Generate new keys (requires FORCE_KEY_GENERATION=true in production)
FORCE_KEY_GENERATION=true bun run generate-keys

# 4. Restart application
```

---

## Configuration Schema

### Application Identity (`app`)

```json
{
	"app": {
		"description": "...", // Application description
		"name": "My Application", // Display name
		"slug": "myapp" // URL-safe identifier (lowercase, no spaces)
	}
}
```

### Server Configuration (`server`)

```json
{
	"server": {
		"backendPort": 3331, // Backend API port
		"frontendPort": 3330, // Frontend server port
		"frontendUrl": "http://...", // Frontend URL (for CORS, redirects)
		"host": "127.0.0.1", // Local default; use 0.0.0.0 only when remote access is intended
		"nodeEnv": "production", // Environment: development/production
		"timezone": "UTC", // Server timezone
		"trustProxy": false // Trust X-Forwarded-* headers
	}
}
```

The default loopback bind keeps development servers off the local network. Set `host` to
`0.0.0.0` only for an intentional container or remote-access deployment, and apply the
authentication, proxy, and production configuration described in
[DEPLOYMENT.md](DEPLOYMENT.md).

### Database Configuration (`database`)

```json
{
	"database": {
		"allowDbPush": false, // Allow drizzle db push (dev only)
		"backup": {
			"compress": false, // Compress backup files
			"enabled": true, // Enable automatic backups
			"encrypt": true, // Encrypt backup files
			"intervalHours": 24, // Backup interval
			"location": "./backups", // Backup storage path
			"retentionDays": 30 // Days to keep backups
		},
		"dialect": "sqlite", // Database dialect (sqlite/postgres)
		"integrityCheck": {
			"enabled": true, // Enable integrity checks
			"intervalHours": 6, // Check interval
			"mode": "quick" // Check mode
		},
		"ssl": {
			"enabled": false, // Enable SSL (for postgres)
			"rejectUnauthorized": true // Reject unauthorized certs
		},
		"url": "file:./data/spernakit.db", // Database file path
		"vacuum": {
			"enabled": true, // Enable automatic VACUUM
			"intervalHours": 24 // VACUUM interval
		}
	}
}
```

### CORS Configuration (`cors`)

```json
{
	"cors": {
		"allowNoOrigin": false, // Allow requests with no Origin header
		"allowedOrigins": [], // Additional allowed origins
		"frontendDevOrigins": ["http://localhost:3330"] // Dev server origins
	}
}
```

### Audit Configuration (`audit`)

```json
{
	"audit": {
		"enabled": true, // Enable audit logging
		"ipWhitelist": [] // IPs excluded from audit logging
	}
}
```

### Email Configuration (`email`)

```json
{
	"email": {
		"retryAttempts": 2, // Number of retry attempts for failed sends
		"retryDelayMs": 1000 // Delay between retries (milliseconds)
	}
}
```

> **Note:** SMTP connection settings (host, port, user, pass, from, secure) are stored in the database settings table, not in the JSON config file. They are managed through the application's admin UI.

### Storage Configuration (`storage`)

```json
{
	"storage": {
		"adapter": "local", // Storage adapter (local/s3)
		"allowedMimeTypes": [
			// Permitted upload MIME types
			"image/jpeg",
			"image/png",
			"image/gif",
			"image/webp",
			"application/pdf",
			"text/plain",
			"text/csv",
			"application/json"
		],
		"maxFileSize": 10485760, // Max file size in bytes (10MB)
		"s3": {
			"accessKeyId": "", // S3 access key
			"bucket": "", // S3 bucket name
			"endpoint": "", // S3 endpoint URL
			"region": "", // S3 region
			"secretAccessKey": "" // S3 secret key
		}
	}
}
```

### OAuth Configuration (`oauth`)

```json
{
	"oauth": {
		"github": {
			"callbackUrl": "", // GitHub OAuth callback URL
			"clientId": "", // GitHub OAuth client ID
			"clientSecret": "", // GitHub OAuth client secret
			"enabled": false // Enable GitHub OAuth
		},
		"google": {
			"callbackUrl": "", // Google OAuth callback URL
			"clientId": "", // Google OAuth client ID
			"clientSecret": "", // Google OAuth client secret
			"enabled": false // Enable Google OAuth
		},
		"microsoft": {
			"callbackUrl": "", // Microsoft OAuth callback URL
			"clientId": "", // Microsoft OAuth client ID
			"clientSecret": "", // Microsoft OAuth client secret
			"enabled": false, // Enable Microsoft OAuth
			"tenantId": "common" // Azure AD tenant ID
		}
	}
}
```

### Roles Configuration (`roles`)

```json
{
	"roles": {
		"ADMIN": {
			"description": "Application administration, user management",
			"label": "Administrator"
		},
		"MANAGER": {
			"description": "Team and workspace member management",
			"label": "Manager"
		},
		"OPERATOR": {
			"description": "Standard operations, data entry and modification",
			"label": "Operator"
		},
		"SYSOP": {
			"description": "System administration, cross-workspace access",
			"label": "System Operator"
		},
		"VIEWER": {
			"description": "Read-only access to permitted resources",
			"label": "Viewer"
		}
	}
}
```

### Metrics Configuration (`metrics`)

```json
{
	"metrics": {
		"collectionIntervalMs": 60000 // Collection interval (60 seconds)
	}
}
```

### Token Cleanup (`tokenCleanup`)

```json
{
	"tokenCleanup": {
		"enabled": true, // Enable expired token cleanup
		"intervalHours": 6, // Cleanup interval
		"minimumIntervalHours": 1 // Minimum interval between cleanups
	}
}
```

### Rate Limiting (`rateLimit`)

```json
{
	"rateLimit": {
		"authEnabled": true, // Enable auth-endpoint rate limiting (independent of `enabled`)
		"enabled": true, // Enable global rate limiting
		"maxRequests": 100, // Max requests per window
		"windowMs": 900000 // Time window (15 minutes)
	}
}
```

`enabled` controls the global API limiter. `authEnabled` independently controls the auth-specific limiter (`/api/v1/auth/*` mutating endpoints). Dev environments commonly disable `authEnabled` to prevent lockouts during scripted multi-role test runs while keeping the global limiter on. Production should leave both `true`.

### Health Checks (`healthCheck`)

```json
{
	"healthCheck": {
		"enabled": true, // Enable health monitoring
		"interval": 300, // Check interval in SECONDS (300 = 5 minutes), not milliseconds
		"retentionDays": 30, // Keep history for N days
		"thresholds": {
			"auth": { "critical": 500, "warn": 100 },
			"db": { "critical": 500, "warn": 100 },
			"fs": { "critical": 200, "warn": 50 },
			"memory": { "critical": 95, "warn": 90 }
		}
	}
}
```

Threshold values for `auth`, `db`, and `fs` are response-time limits in milliseconds; `memory` thresholds are heap-usage percentages.

### Alerting (`alerting`)

Controls how health-check alerts are delivered.

```json
{
	"alerting": {
		"cooldownMinutes": 15, // Minimum minutes between repeat alerts for the same check
		"email": {
			"enabled": false, // Send alert emails
			"recipients": [] // Email addresses to notify
		},
		"inApp": {
			"enabled": true // Create in-app notifications for alerts
		},
		"webhook": {
			"enabled": false, // POST alerts to an external webhook
			"headers": {}, // Extra headers to send with webhook requests
			"secret": "", // Shared secret for webhook signing
			"timeoutMs": 5000, // Webhook request timeout (milliseconds)
			"url": "" // Webhook URL (empty string disables)
		}
	}
}
```

### Logging (`logging`)

```json
{
	"logging": {
		"file": {
			"enabled": true, // Write logs to a rotating file
			"maxFiles": 10, // Number of rotated files to keep
			"maxSize": "10M", // Max size per file before rotation
			"path": "./logs/app.log" // Log file path
		},
		"level": "info" // Log level: debug | info | warn | error
	}
}
```

### Data Retention (`retention`)

Per-table retention windows, in days (minimum 1), applied by the scheduled cleanup tasks.

```json
{
	"retention": {
		"auditLogsDays": 90, // Audit log entries
		"businessEventsDays": 365, // Business metrics events
		"healthCheckAlertsDays": 30, // Health check alerts
		"healthCheckLogsDays": 30, // Health check logs
		"notificationsDays": 30, // User notifications
		"scheduledTaskExecutionsDays": 30, // Scheduled task execution history
		"softDeletedFilesDays": 30, // Soft-deleted uploaded files
		"systemMetricsDays": 30 // System metrics samples
	}
}
```

### Dashboards (`dashboards`)

```json
{
	"dashboards": {
		"enabled": true, // Enable custom dashboards feature
		"maxPerUser": 10, // Max dashboards per user (minimum 1)
		"sharingEnabled": true // Allow sharing dashboards with other users
	}
}
```

### Database Admin Panel (`databaseAdmin`)

```json
{
	"databaseAdmin": {
		"enabled": false // Opt-in kill-switch for the SYSOP database-admin panel
	}
}
```

Disabled by default. When `false`, the database-admin panel (schema explorer, raw table read/write, SQL sandbox) is unavailable even to SYSOP users. Because the panel grants raw database access, deployments must opt in explicitly by setting `databaseAdmin.enabled: true` - recommended for development environments only.

---

## Environment-Specific Configuration

### Development

```json
{
	"database": {
		"allowDbPush": true,
		"url": "file:./data/myapp-dev.db"
	},
	"rateLimit": {
		"enabled": false
	},
	"server": {
		"frontendUrl": "http://localhost:3330",
		"nodeEnv": "development"
	}
}
```

### Production

```json
{
	"database": {
		"allowDbPush": false,
		"url": "file:./data/myapp.db"
	},
	"rateLimit": {
		"enabled": true,
		"maxRequests": 100
	},
	"security": {
		"bcryptRounds": 12
	},
	"server": {
		"frontendUrl": "https://myapp.com",
		"nodeEnv": "production",
		"trustProxy": true
	}
}
```

### Docker

Docker deployments automatically use JSON config from `/app/config/{appname}.json`.

The `docker/start.sh` script:

1. Creates config from defaults if not present
2. Generates secure keys automatically
3. Sets `DOCKER_ENV=true` environment variable

---

## Additional Resources

- [Getting Started Guide](GETTING_STARTED.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Security Guide](SECURITY.md)
- [Docker Deployment](DEPLOYMENT.md#docker-deployment)

---

## Troubleshooting

### Config Not Loading

**Problem:** Application fails to find configuration

**Solution:**

```bash
# Ensure JSON config exists
ls -la config/

# Create config if missing
bun run setup

# Verify config is valid
cat config/myapp.json | jq .
```

### Invalid Configuration

**Problem:** Application fails to start with config errors

**Solution:**

```bash
# Validate JSON syntax
cat config/myapp.json | jq .

# Check for required fields
bun run generate-keys  # Regenerates with validation
```

### Missing Security Keys

**Problem:** "secretOrPrivateKey must be an asymmetric key when using ES256" or missing JWT key error

**Solution:**

```bash
# Generate all required keys
bun run generate-keys

# Verify keys are present
cat config/myapp.json | jq '.security'
```

### Port Conflicts

**Problem:** "Port already in use" error

**Solution:**

```json
{
	"server": {
		"backendPort": 3341,
		"frontendPort": 3340 // Change to available port
	}
}
```
