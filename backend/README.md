# Backend - Spernakit v3

The Elysia-based REST API backend for Spernakit v3.

## Overview

This backend provides:

- **RESTful API** with OpenAPI documentation
- **JWT Authentication** with HTTP-only cookies
- **5-tier RBAC** (SYSOP, ADMIN, MANAGER, OPERATOR, VIEWER)
- **Multi-tenancy** via workspaces
- **Real-time** WebSocket support
- **File uploads** with pluggable storage
- **Audit logging** for compliance
- **Scheduled tasks** with an interval-based scheduler

## Tech Stack

| Category       | Technology                           |
| -------------- | ------------------------------------ |
| Runtime        | Bun 1.3.14+                          |
| Framework      | Elysia (Bun-native HTTP)             |
| Database       | SQLite via bun:sqlite + Drizzle ORM  |
| Authentication | JWT with HTTP-only cookies           |
| Validation     | TypeBox (via Elysia route schemas)   |
| Config         | Zod (for JSON config validation)     |
| Logging        | pino (structured JSON logging)       |
| API Docs       | @elysiajs/swagger (OpenAPI 3.0)      |
| WebSocket      | Bun native WebSocket                 |
| Email          | nodemailer (SMTP)                    |
| Scheduling     | Built-in interval scheduler          |
| Compression    | nginx + Vite precompression          |
| Image          | Bun.Image (built-in, for thumbnails) |

## Directory Structure

```
backend/src/
├── app.ts                 # Application entry point
├── create-api-app.ts      # API route composition
├── config/
│   ├── configLoader.ts    # JSON config loader with Zod validation
│   ├── configLogger.ts    # Shared environment-aware config logger
│   ├── configSchema.ts    # Root Zod schema
│   ├── configSchemas/     # Per-domain Zod schemas (security, server, etc.)
│   ├── configSecrets.ts   # Secret generation and env overrides
│   ├── configValidator.ts # Config validation with warnings
│   └── defaults.json      # Default configuration values
├── constants/             # Named constants for magic numbers
├── db/
│   ├── index.ts           # Database initialization (SQLite + PostgreSQL)
│   ├── schema/            # Drizzle ORM table definitions (SQLite)
│   ├── schema-pg/         # Drizzle ORM table definitions (PostgreSQL)
│   └── seed/              # Demo data seeding
│       ├── index.ts       # Seed orchestrator
│       ├── constants.ts   # Seed constants
│       ├── types.ts       # Seed types
│       ├── users.ts       # User seed data
│       └── workspaces.ts  # Workspace seed data
├── guards/                # Authorization guards (API key auth handled by authPlugin)
│   ├── role.ts            # Role-based access control
│   └── workspaceAccess.ts # Workspace membership checks
├── plugins/               # Elysia plugins (cross-cutting concerns)
├── routes/                # API route handlers (one file per domain)
├── schemas/               # Shared TypeBox schemas for routes
├── services/              # Business logic layer
│   ├── auth/              # Auth core, login, password reset
│   ├── backup/            # Backup core, lifecycle, restore
│   ├── dashboard/         # Dashboard CRUD, sharing, templates
│   ├── databaseAdmin/     # SQL executor, redaction
│   ├── health/            # Health checks, alerts, config
│   ├── metrics/           # System and business metrics
│   ├── notification/      # Notification CRUD, preferences
│   ├── oauth/             # OAuth providers, account linking
│   ├── scheduler/         # Task scheduling, lifecycle
│   ├── user/              # User CRUD, batch ops, validation
│   ├── websocket/         # WebSocket broadcast, helpers
│   └── workspace/         # Workspace CRUD, members
├── storage/               # File storage adapters
│   ├── index.ts           # Storage factory
│   ├── localAdapter.ts    # Local filesystem storage
│   ├── s3Adapter.ts       # S3-compatible storage
│   └── types.ts           # Storage interface
├── types/                 # TypeScript type definitions
└── utils/                 # Helper functions
```

## Getting Started

### Prerequisites

- Bun 1.3.14+ installed
- Root dependencies installed (`bun install` from project root)

### Running Locally

```bash
# From project root
bun run dev:backend

# Or from backend directory
bun run dev
```

The API will be available at `http://localhost:3331`.

### Available Scripts

| Script                        | Description                     |
| ----------------------------- | ------------------------------- |
| `bun run dev`                 | Start with hot reload           |
| `bun run start`               | Start without hot reload        |
| `bun run build`               | Compile TypeScript              |
| `bun run typecheck`           | Type check without emitting     |
| `bun run lint`                | Run ESLint                      |
| `bun run lint:fix`            | Fix ESLint issues               |
| `bun run db:push`             | Push schema changes to database |
| `bun run db:seed`             | Seed demo data                  |
| `bun run db:studio`           | Open Drizzle Studio             |
| `bun run db:migrate`          | Run pending migrations          |
| `bun run db:migrate:baseline` | Create baseline migration       |
| `bun run db:migrate:status`   | Show migration status           |
| `bun run db:generate`         | Generate migration from schema  |

## API Routes

All routes below are relative to the `/api/v1` prefix.

### Authentication

| Method | Path                             | Description            | Auth   |
| ------ | -------------------------------- | ---------------------- | ------ |
| POST   | `/auth/login`                    | Login with credentials | Public |
| POST   | `/auth/logout`                   | Clear auth cookies     | Auth   |
| POST   | `/auth/refresh`                  | Refresh access token   | Public |
| GET    | `/auth/me`                       | Get current user       | Auth   |
| POST   | `/auth/forgot-password`          | Request reset token    | Public |
| POST   | `/auth/reset-password`           | Confirm reset          | Public |
| GET    | `/auth/oauth/providers`          | List OAuth providers   | Public |
| GET    | `/auth/oauth/:provider`          | Redirect to OAuth      | Public |
| GET    | `/auth/oauth/:provider/callback` | OAuth callback         | Public |

### Users

| Method | Path                 | Description        | Auth   |
| ------ | -------------------- | ------------------ | ------ |
| GET    | `/users`             | List users         | ADMIN+ |
| GET    | `/users/:id`         | Get user by ID     | ADMIN+ |
| POST   | `/users`             | Create user        | ADMIN+ |
| PUT    | `/users/:id`         | Update user        | ADMIN+ |
| DELETE | `/users/:id`         | Soft delete user   | ADMIN+ |
| PUT    | `/users/me`          | Update own profile | Auth   |
| PUT    | `/users/me/password` | Change password    | Auth   |

### Workspaces

| Method | Path                              | Description      | Auth      |
| ------ | --------------------------------- | ---------------- | --------- |
| GET    | `/workspaces`                     | List workspaces  | Auth      |
| GET    | `/workspaces/:id`                 | Get workspace    | Auth      |
| POST   | `/workspaces`                     | Create workspace | ADMIN+    |
| PUT    | `/workspaces/:id`                 | Update workspace | WS ADMIN+ |
| DELETE | `/workspaces/:id`                 | Delete workspace | ADMIN+    |
| GET    | `/workspaces/:id/members`         | List members     | Auth      |
| POST   | `/workspaces/:id/members`         | Add member       | WS ADMIN+ |
| PUT    | `/workspaces/:id/members/:userId` | Update member    | WS ADMIN+ |
| DELETE | `/workspaces/:id/members/:userId` | Remove member    | WS ADMIN+ |

### Notifications

| Method | Path                         | Description         | Auth   |
| ------ | ---------------------------- | ------------------- | ------ |
| GET    | `/notifications`             | List notifications  | Auth   |
| GET    | `/notifications/statistics`  | Get counts          | Auth   |
| GET    | `/notifications/preferences` | Get preferences     | Auth   |
| PUT    | `/notifications/preferences` | Update preferences  | Auth   |
| PUT    | `/notifications/:id/read`    | Mark as read        | Auth   |
| PUT    | `/notifications/read-all`    | Mark all read       | Auth   |
| DELETE | `/notifications/:id`         | Delete notification | Auth   |
| POST   | `/notifications/bulk-delete` | Bulk delete         | Auth   |
| POST   | `/notifications/broadcast`   | Broadcast message   | ADMIN+ |

### System & Health

| Method | Path                 | Description        | Auth      |
| ------ | -------------------- | ------------------ | --------- |
| GET    | `/health`            | Basic health check | Public    |
| GET    | `/health/details`    | Detailed health    | OPERATOR+ |
| GET    | `/health/history`    | Health history     | ADMIN+    |
| GET    | `/system/dashboard`  | Dashboard stats    | Auth      |
| GET    | `/system/metrics`    | Historical metrics | Auth      |
| POST   | `/system/web-vitals` | Report web vitals  | Auth      |

### Other

| Method | Path                   | Description          | Auth      |
| ------ | ---------------------- | -------------------- | --------- |
| GET    | `/audit-logs`          | Query audit logs     | ADMIN+    |
| GET    | `/settings`            | Get all settings     | OPERATOR+ |
| GET    | `/settings/:key`       | Get setting          | OPERATOR+ |
| PUT    | `/settings`            | Update settings      | ADMIN+    |
| POST   | `/files/upload`        | Upload file          | Auth      |
| GET    | `/files/:id`           | Download file        | Auth      |
| DELETE | `/files/:id`           | Delete file          | Auth      |
| GET    | `/tasks`               | List scheduled tasks | ADMIN+    |
| POST   | `/tasks/:name/trigger` | Trigger task         | ADMIN+    |

### API Documentation

Interactive Swagger UI is available at `/api/v1/docs`.

OpenAPI spec JSON is available at `/api/v1/docs/json`.

## Architecture Patterns

### Layered Architecture

```
Routes → Services → Database
   ↓         ↓
Guards    Plugins
```

- **Routes**: Handle HTTP requests, validate input, call services
- **Services**: Business logic, database operations
- **Guards**: Authorization checks (role, workspace)
- **Plugins**: Cross-cutting concerns (auth, logging, audit)

### Adding a New Route

1. Create route file in `routes/`:

```typescript
import { Elysia, t } from 'elysia';
import { requireRoleFresh } from '../guards/role.ts';
import { list } from '../services/myService.ts';

export const myRoutes = new Elysia({ prefix: '/my-resource' }).get(
	'/',
	({ user, set }) => {
		return list(user.id);
	},
	{
		beforeHandle: ({ set, user }) => requireRoleFresh('VIEWER')({ set, user }),
	}
);
```

2. Register in `app.ts`:

```typescript
import { myRoutes } from './routes/my.ts';
// ...
.use(myRoutes)
```

### Adding a New Service

1. Create service file in `services/`:

```typescript
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { myTable } from '../db/schema/myTable.ts';

export function list(userId: number) {
	const db = getDb();
	return db.select().from(myTable).where(eq(myTable.userId, userId)).all();
}
```

### Adding a New Plugin

1. Create plugin file in `plugins/`:

```typescript
import { Elysia } from 'elysia';

export const myPlugin = new Elysia({ name: 'my-plugin' })
	.onBeforeHandle(({ request }) => {
		// Pre-request logic
	})
	.derive(({ request }) => ({
		myValue: 'derived',
	}));
```

2. Use in `app.ts`:

```typescript
.use(myPlugin)
```

## Database

### Schema Location

Drizzle schema files are in `src/db/schema/`. Each file defines one or more tables.

### Naming Conventions

- **Tables**: plural snake_case (`users`, `audit_logs`)
- **Columns**: snake_case in DB, camelCase in TypeScript
- **Indexes**: `idx_{table}_{columns}`
- **Foreign keys**: `fk_{table}_{referenced}`

### Common Operations

```bash
# Push schema changes to database
bun run db:push

# Seed demo data
bun run db:seed

# Open Drizzle Studio (database browser)
bun run db:studio
```

## Configuration

Configuration is loaded from `config/{appname}.json` with defaults from `defaults.json`.

Key settings:

- `server.backendPort`: API port (default: 3331)
- `database.url`: SQLite file path
- `security.jwtPrivateKey`: EC private key for JWT signing
- `security.cookieSecret`: Cookie signing secret
- `rateLimit.enabled`: Enable rate limiting

See `configSchema.ts` for all available options.

## Related Documentation

- [Developer Guide](../docs/template/DEVELOPMENT.md)
- [API Reference](../docs/template/API_REFERENCE.md)
- [Configuration](../docs/template/CONFIGURATION.md)
- [Deployment](../docs/template/DEPLOYMENT.md)
