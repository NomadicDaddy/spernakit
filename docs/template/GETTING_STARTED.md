# Getting Started with Spernakit

This guide gets a Spernakit app running on your machine.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [First Steps](#first-steps)
5. [Default Users](#default-users)
6. [Next Steps](#next-steps)

---

## Prerequisites

You'll need:

- **Bun 1.3.14+** ([Install Bun](https://bun.sh)) - the runtime and required package manager
- **Git**
- **A code editor** (VS Code recommended)

Node.js is **not required** - Spernakit runs on Bun, and no Node version is pinned. Install Node.js only if you want npm-based tooling alongside Bun.

### Verify Your Environment

```bash
# Check Bun version (should be 1.3.14+)
bun --version

# Check Git
git --version
```

---

## Quick Start

### 1. Clone and Initialize

```bash
# Clone the template
git clone <your-spernakit-repo> my-new-app
cd my-new-app

# Install dependencies
bun install
```

### 2. Configure Application

**Option A: Automated setup (recommended)**

```bash
# Run interactive setup to customize your app
bun run setup

# This will:
# - Create config/{appname}.json with your settings
# - Generate secure cryptographic keys
# - Customize app name, ports, and database path
```

**Option B: Manual configuration**

```bash
# Generate JSON config from defaults
bun run generate-keys

# Edit config/{appname}.json with your settings
# The defaults work for local development
```

## Configuration Approach

Spernakit reads its settings from **JSON configuration files** - they're the single source of truth.

### Configuration Hierarchy

1. **Primary source**: `config/{appname}.json` - all application configuration
2. **Runtime environment**: `process.env` - scripts populate this from JSON for compatibility
3. **No `.env` files**: Bun sets `env = false` in `bunfig.toml`, so `.env` is not auto-loaded
4. **Development vs production**: use a different JSON config file per environment

### Why JSON Config?

- **Consistency**: the same approach across every deployment environment
- **Version control**: config can be committed and versioned (except secrets)
- **No runtime confusion**: nothing depends on environment-variable injection
- **Validation**: the TypeScript interfaces in `backend/src/config/configLoader.ts` enforce the structure

### Environment Variables in Scripts

Scripts sometimes reference environment variables (e.g. `process.env.PORT`). Those come from the JSON config files via `load-json-config.ts`, not from `.env` files or the system environment.

### 3. Initialize Database

```bash
# Set up database and seed with default users
bun run db:setup

# Note: The database is auto-seeded on first start, so db:setup is not
# strictly required for initial setup. It's useful if you want to
# explicitly initialize the database before starting the server.
```

### 4. Start Development

```bash
# Start both frontend and backend
bun run dev
```

Your app is now running:

- **Frontend**: http://localhost:3330
- **Backend**: http://localhost:3331
- **Health check**: http://localhost:3331/api/v1/health

---

## Project Structure

```
my-new-app/
├── backend/                        # Elysia API server (Bun runtime)
│   ├── src/
│   │   ├── app.ts                  # Main application entrypoint
│   │   ├── config/                 # Configuration loader and schema
│   │   ├── constants/              # Shared constants (roles, permissions, etc.)
│   │   ├── db/                     # Database setup and Drizzle schema
│   │   │   ├── schema/             # Drizzle ORM table definitions
│   │   │   └── index.ts            # Database initialization
│   │   ├── guards/                 # Authorization guards (role, workspace)
│   │   ├── plugins/                # Elysia plugins (auth, rate limit, audit)
│   │   ├── routes/                 # API route definitions
│   │   ├── services/               # Business logic & integration services
│   │   ├── types/                  # TypeScript type definitions
│   │   └── utils/                  # Helper functions and utilities
│   └── package.json
├── frontend/                       # React 19 + TypeScript client
│   ├── src/
│   │   ├── api/                    # API client and types
│   │   ├── components/             # Reusable UI components (shadcn/ui)
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── lib/                    # Utility libraries
│   │   ├── pages/                  # Route components
│   │   ├── stores/                 # Zustand state management
│   │   └── types/                  # TypeScript definitions
│   └── package.json
├── data/                           # SQLite database files
├── docs/                           # Documentation
├── scripts/                        # Automation scripts
└── package.json                    # Root package.json
```

---

## First Steps

### 1. Log In

Go to http://localhost:3330 and log in as any of the [default users](#default-users).

### 2. Explore the Dashboard

- **System Health**: application metrics
- **User Management**: manage users and roles (ADMIN+ only)
- **Profile Settings**: your user preferences
- **Notifications**: system notifications

### 3. Check the API

Visit http://localhost:3331/api/v1/health to confirm the backend is up.

### 4. Read the Code

- **Backend API**: start with `backend/src/app.ts`
- **Frontend app**: start with `frontend/src/App.tsx`
- **Database schema**: see `backend/src/db/schema/`

---

## Default Users

The template ships with these accounts for testing:

| Username | Password    | Role     | Description               |
| -------- | ----------- | -------- | ------------------------- |
| sysop    | sysop123    | SYSOP    | System administrator      |
| admin    | admin123    | ADMIN    | Application administrator |
| manager  | manager123  | MANAGER  | Team and user manager     |
| operator | operator123 | OPERATOR | Standard operator         |
| viewer   | viewer123   | VIEWER   | Read-only access          |

**Important**: these accounts use fixed demo passwords. Remove them or change every password before deploying to production.

---

## Basic Customization

### Update Application Branding

Edit `config/{appname}.json`:

```json
{
	"app": {
		"description": "The best application ever built",
		"name": "My Awesome App",
		"slug": "my-awesome-app"
	},
	"server": {
		"backendPort": 3331,
		"frontendPort": 3330
	}
}
```

### Update the HTML Title

```html
<!-- frontend/index.html -->
<title>My Awesome App</title>
<meta content="The best application ever built" name="description" />
```

### Replace the Favicon

Replace `frontend/public/vite.svg` with your logo.

---

## Health Checks

Confirm everything is working:

```bash
# Check backend health
curl http://localhost:3331/api/v1/health

# Check frontend accessibility
curl http://localhost:3330

# Open database browser
bun run --cwd backend db:studio
```

---

## Common Issues

### Port Already in Use

```bash
# Find process using port
lsof -i :3331  # or :3330

# Kill process
kill -9 <PID>

# Or change ports in config/{appname}.json
```

### Database Issues

```bash
# Reset database (development only)
bun scripts/reset-database.ts

# Generate and run migrations after schema changes
bun run db:generate
bun run db:migrate
```

---

## Verify Installation with Tests

After installing and running Spernakit, run the smoke tests to confirm everything works:

```bash
# Run smoke tests for development environment
bun run smoke:dev

# Run smoke tests for preview environment
bun run smoke:preview

# Run quality control checks
bun run smoke:qc

# Capture screenshots of all pages
bun run smoke:screenshots
```

### Reading Smoke Test Results

The `smoke:qc` quality gate runs the check-only pipeline from `scripts/smoke.json`: drift, config, docs, typecheck, lint, build, API contract, schema parity, format, and dependency-version checks. If they all pass, your installation is good.

### Running Specific Tests

For details, see the [Testing Guide](TESTING.md).

---

## Next Steps

With Spernakit running, here's where to go next.

**Learn the fundamentals**

- [Developer Guide](DEVELOPMENT.md) - core patterns and architecture
- [API Reference](API_REFERENCE.md) - backend API documentation

**Customize your app**

- [Customization Guide](CUSTOMIZATION.md) - add features and modify the template
- [RBAC System](RBAC.md) - how role-based access control works

**Deploy to production**

- [Deployment Guide](DEPLOYMENT.md) - production deployment strategies

**Get help**

- [Troubleshooting](TROUBLESHOOTING.md) - common issues and solutions
- [GitHub Issues](https://github.com/NomadicDaddy/spernakit/issues) - report bugs or ask questions
