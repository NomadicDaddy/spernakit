# 🚀 Getting Started with Spernakit

This guide will get you up and running with the Spernakit enterprise application template in minutes.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [First Steps](#first-steps)
5. [Default Users](#default-users)
6. [Next Steps](#next-steps)

---

## 🔧 Prerequisites

Before you begin, ensure you have:

- **Node.js 24.x** (`.nvmrc` pins 24)
- **Bun 1.3.14+** ([Install Bun](https://bun.sh)) - Required package manager
- **Git** for version control
- **Code editor** (VS Code recommended)

### Verify Your Environment

```bash
# Check Node.js version (should be 24.x)
node --version

# Check Bun version (should be 1.3.14+)
bun --version

# Check Git
git --version
```

---

## ⚡ Quick Start

### 1. Clone and Initialize

```bash
# Clone the template
git clone <your-spernakit-repo> my-new-app
cd my-new-app

# Install dependencies
bun install
```

### 2. Configure Application

**Option A: Automated Setup (Recommended)**

```bash
# Run interactive setup to customize your app
bun run setup

# This will:
# - Create config/{appname}.json with your settings
# - Generate secure cryptographic keys
# - Customize app name, ports, and database path
```

**Option B: Manual Configuration**

```bash
# Generate JSON config from defaults
bun run generate-keys

# Edit config/{appname}.json with your settings
# The defaults work for local development
```

## ⚙️ Configuration Approach

Spernakit uses **JSON configuration files** as the single source of truth for application settings.

### Configuration Hierarchy

1. **Primary Source**: `config/{appname}.json` - All application configuration
2. **Runtime Environment**: `process.env` - Scripts populate this from JSON for compatibility
3. **No `.env` Files**: Bun has `env = false` in `bunfig.toml`, so `.env` is NOT auto-loaded
4. **Development vs Production**: Use different JSON config files per environment

### Why JSON Config?

- **Consistency**: Same configuration approach across deployment environments
- **Version Control**: Configuration can be committed and versioned (except secrets)
- **No Runtime Confusion**: No environment variable injection required
- **Validation**: TypeScript interfaces in `backend/src/config/configLoader.ts` enforce structure

### Environment Variables in Scripts

You may see references to environment variables (e.g., `process.env.PORT`) in scripts. These are populated from JSON config files by `load-json-config.ts`, not from `.env` files or system environment.

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

**That's it!** Your application is now running:

- **Frontend**: http://localhost:3330
- **Backend**: http://localhost:3331
- **Health Check**: http://localhost:3331/api/v1/health

---

## 📁 Project Structure

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

## 🎯 First Steps

### 1. Login to Your Application

Navigate to http://localhost:3330 and log in with any of the [default users](#default-users).

### 2. Explore the Dashboard

- **System Health**: View application metrics
- **User Management**: Manage users and roles (ADMIN+ only)
- **Profile Settings**: Customize your user preferences
- **Notifications**: View system notifications

### 3. Check the API

Visit http://localhost:3331/api/v1/health to verify the backend is running.

### 4. Explore the Code

- **Backend API**: Start with `backend/src/app.ts`
- **Frontend App**: Start with `frontend/src/App.tsx`
- **Database Schema**: Check `backend/src/db/schema/`

---

## 👥 Default Users

The template includes pre-configured users for testing:

| Username | Password    | Role     | Description               |
| -------- | ----------- | -------- | ------------------------- |
| sysop    | sysop123    | SYSOP    | System administrator      |
| admin    | admin123    | ADMIN    | Application administrator |
| manager  | manager123  | MANAGER  | Team and user manager     |
| operator | operator123 | OPERATOR | Standard operator         |
| viewer   | viewer123   | VIEWER   | Read-only access          |

**⚠️ Important**:

- Seed accounts use fixed demo passwords — remove them or change all passwords before deploying to production!

---

## 🎨 Basic Customization

### Update Application Branding

Edit your `config/{appname}.json` file:

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

### Update HTML Title

```html
<!-- frontend/index.html -->
<title>My Awesome App</title>
<meta content="The best application ever built" name="description" />
```

### Replace Favicon

Replace `frontend/public/vite.svg` with your logo.

---

## 🔍 Health Checks

Verify everything is working:

```bash
# Check backend health
curl http://localhost:3331/api/v1/health

# Check frontend accessibility
curl http://localhost:3330

# Open database browser
bun run --cwd backend db:studio
```

---

## 🚨 Common Issues

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

## 🧪 Verify Installation with Tests

After installing and running Spernakit, verify everything works by running smoke tests:

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

### Understanding Smoke Test Results

The `smoke:qc` quality gate runs the canonical check-only pipeline from
`scripts/smoke.json`, including drift, config, docs, typecheck, lint, build, API contract,
schema parity, format, and dependency-version checks.

If all checks pass, your installation is successful!

### Running Specific Tests

For detailed testing information, see the comprehensive [Testing Guide](TESTING.md).

---

## ➡️ Next Steps

Now that you have Spernakit running, here's what to do next:

### **Learn the Fundamentals**

- [**Developer Guide**](DEVELOPMENT.md) - Core patterns and architecture
- [**API Reference**](API_REFERENCE.md) - Backend API documentation

### **Customize Your App**

- [**Customization Guide**](CUSTOMIZATION.md) - Add features and modify the template
- [**RBAC System**](RBAC.md) - Understand the role-based access control

### **Deploy to Production**

- [**Deployment Guide**](DEPLOYMENT.md) - Production deployment strategies

### **Get Help**

- [**Troubleshooting**](TROUBLESHOOTING.md) - Common issues and solutions
- [**GitHub Issues**](https://github.com/NomadicDaddy/spernakit/issues) - Report bugs or ask questions

---

**Ready to dive deeper?** → [**Developer Guide**](DEVELOPMENT.md)

**Need help?** → [**Troubleshooting**](TROUBLESHOOTING.md)
