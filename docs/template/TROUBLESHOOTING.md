# 🔧 Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Spernakit template.

## 📋 Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Installation Issues](#installation-issues)
3. [Database Problems](#database-problems)
4. [Authentication Issues](#authentication-issues)
5. [API Connection Problems](#api-connection-problems)
6. [Frontend Issues](#frontend-issues)
7. [Docker Issues](#docker-issues)
8. [Performance Problems](#performance-problems)
9. [Common Error Messages](#common-error-messages)
10. [Getting Help](#getting-help)

---

## 🩺 Quick Diagnostics

### Health Check Commands

```bash
# Check backend health
curl http://localhost:3331/api/v1/health

# Check frontend accessibility
curl http://localhost:3330

# Check database connection
bun run --cwd backend db:studio
```

### Environment Verification

```bash
# Check Node.js version (should be 24.x)
node --version

# Check Bun version (should be 1.3.14+)
bun --version

# Verify JSON config exists
ls config/*.json

# Inspect key settings (example uses jq)
jq '.server.backendPort, .server.frontendPort, .security.jwtPrivateKey' config/*.json
```

---

## 📦 Installation Issues

### Problem: `bun install` fails

**Symptoms:**

- Package installation errors
- Permission denied errors
- Network timeout errors

**Solutions:**

```bash
# Clear Bun cache
bun pm cache rm

# Delete node_modules and reinstall
rm -rf node_modules bun.lock
bun install
```

### Problem: Workspace dependencies not found

**Symptoms:**

- "Cannot find module" errors
- Workspace commands fail

**Solutions:**

```bash
# Reinstall from root
bun install

# Install workspace dependencies explicitly
bun install --cwd backend
bun install --cwd frontend

# Verify workspace configuration
bun run lint
```

### Problem: Node.js version incompatibility

**Symptoms:**

- Syntax errors in modern JavaScript
- Package compatibility warnings

**Solutions:**

```bash
# Check current version
node --version

# Install Node.js 24 using nvm (recommended)
nvm install 24
nvm use 24

# Or download from nodejs.org
# Ensure Bun is also updated
bun upgrade
```

---

## 🗄️ Database Problems

### Problem: Database connection fails

**Symptoms:**

- "Cannot connect to database" errors
- Drizzle ORM errors
- Schema push failures

**Solutions:**

```bash
# Check database file exists
ls -la data/

# Generate and run migrations
bun run db:generate
bun run db:migrate

# Reset database (development only) - delete the database file and re-setup
rm data/*.db
bun run db:setup

# Open Drizzle Studio to inspect data
bun run --cwd backend db:studio
```

### Problem: Schema push errors

**Symptoms:**

- "Schema push failed" messages
- Schema inconsistencies
- Foreign key constraint errors

**Solutions:**

```bash
# Generate and run migrations
bun run db:generate
bun run db:migrate

# Reset database and re-setup (development only)
rm data/*.db
bun run db:setup

# Seed database with default data
bun run --cwd backend db:seed
```

### Problem: Drizzle schema out of sync

**Symptoms:**

- TypeScript errors about missing properties
- Runtime errors about unknown fields

**Solutions:**

```bash
# Generate and run migrations
bun run db:generate
bun run db:migrate

# Restart development server
bun run dev
```

---

## 🔐 Authentication Issues

### Problem: Login fails with correct credentials

**Symptoms:**

- "Invalid credentials" error with known good password
- JWT token not being set
- Immediate logout after login

**Solutions:**

1. **Check security keys in JSON config:**

```bash
# Inspect security keys
jq '.security.jwtPrivateKey // empty' config/*.json

# Generate fresh keys if missing
bun run generate-keys
```

2. **Check cookie settings:**

```bash
# Verify frontend/backend URLs in config match
jq '.server.frontendUrl' config/*.json
```

3. **Clear browser data:**

- Clear cookies for localhost:3330
- Clear localStorage
- Try incognito/private browsing

### Problem: Session expires immediately

**Symptoms:**

- User logged out after page refresh
- "Session expired" messages
- Authentication loops

**Solutions:**

1. **Check cookie configuration:**

```typescript
// Auth cookies are built in backend/src/utils/auth/authHelpers.ts
// (used by the route files under backend/src/routes/auth/*.ts).
// SameSite is always Strict; the Secure flag comes from
// security.cookieSecure in config/{appname}.json — if it is true
// while you are serving plain HTTP, the browser drops the cookie.
`${name}=${value}; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=${maxAge}${secure}`;
```

2. **Verify token expiration:**

```bash
# Check JWT key pair and token expiration settings
grep -r "expiresIn\|maxAge" backend/src/
```

### Problem: Role-based access not working

**Symptoms:**

- Users can access restricted pages
- API returns 403 for valid roles
- Role hierarchy not respected

**Solutions:**

1. **Verify user role in database:**

```bash
bun run --cwd backend db:studio
# Check users table for correct roles
```

2. **Check role constants:**

```bash
# Role types and hierarchy live in the shared package
grep -n "ROLES\|ROLE_HIERARCHY" shared/src/roles.ts

# Role display labels/descriptions (config schema)
grep -n "label\|description" backend/src/config/configSchemas/roles.ts
```

---

## 🌐 API Connection Problems

### Problem: Frontend cannot connect to backend

**Symptoms:**

- Network errors in browser console
- "Failed to fetch" errors
- CORS errors

**Solutions:**

1. **Check ports and URLs:**

```bash
# Verify backend is running
curl http://localhost:3331/api/v1/health

# Check frontend API configuration
grep -r "localhost:3331" frontend/src/
```

2. **CORS configuration:**

```typescript
// In backend/src/plugins/cors.ts, CORS origins are configured from JSON config
// Check config/{appname}.json for:
// - server.frontendUrl
// - cors.frontendDevOrigins (additional allowed origins)
```

3. **Configuration values:**

```bash
# Check ports and URLs in config
jq '.server.backendPort, .server.frontendPort, .server.frontendUrl' config/*.json
```

### Problem: API requests return 401 Unauthorized

**Symptoms:**

- All API calls fail with 401
- User appears logged in but API rejects requests
- Token validation fails

**Solutions:**

1. **Check authentication middleware:**

```bash
# Verify token is being sent
# Check browser Network tab for Authorization header or cookies
```

2. **Token validation:**

```bash
# Test the current-user endpoint with saved cookies
curl -b cookies.txt http://localhost:3331/api/v1/auth/me
```

---

## ⚛️ Frontend Issues

### Problem: React app won't start

**Symptoms:**

- "Failed to compile" errors
- TypeScript errors
- Module resolution errors

**Solutions:**

```bash
# Clear cache and reinstall
rm -rf frontend/node_modules frontend/dist
bun install --cwd frontend

# Check TypeScript configuration
bun run --cwd frontend typecheck

# Verify Vite configuration
bun run --cwd frontend dev
```

### Problem: Hot reload not working

**Symptoms:**

- Changes don't reflect in browser
- Manual refresh required
- Development server issues

**Solutions:**

```bash
# Restart development server
bun run dev

# Check file watchers (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Clear browser cache
# Disable browser extensions
```

### Problem: Build fails

**Symptoms:**

- TypeScript compilation errors
- Missing dependencies
- Asset optimization failures

**Solutions:**

```bash
# Check TypeScript errors
bun run --cwd frontend lint

# Build with verbose output
bun run --cwd frontend build --verbose

# Check for missing dependencies
bun pm --cwd frontend ls
```

---

## 🐳 Docker Issues

### Problem: Docker containers won't start

**Symptoms:**

- "Container exited with code 1"
- Port binding errors
- Image build failures

**Solutions:**

```bash
# Check Docker daemon
docker --version
docker info

# Rebuild images
docker compose down
docker compose build --no-cache
docker compose up -d

# Check logs
docker compose logs -f
```

### Problem: Database not accessible in Docker

**Symptoms:**

- Connection refused errors
- Database file not found
- Permission errors

**Solutions:**

```bash
# Check volume mounts
docker compose config

# Verify database directory
ls -la data/

# Check container logs
docker compose logs spernakit
```

---

## ⚡ Performance Problems

### Problem: Slow API responses

**Symptoms:**

- Long loading times
- Timeout errors
- High memory usage

**Solutions:**

1. **Check database queries:**

```bash
# Enable query logging
# Check for N+1 queries
# Add database indexes if needed
```

2. **Monitor system resources:**

```bash
# Check memory usage
free -h

# Check CPU usage
top

# Check disk space
df -h
```

### Problem: Frontend performance issues

**Symptoms:**

- Slow page loads
- Laggy interactions
- High memory usage in browser

**Solutions:**

```bash
# Check for memory leaks using React DevTools Profiler
# Optimize component re-renders
# Use browser DevTools Network tab to identify large assets
```

---

## ❌ Common Error Messages

### "Cannot find module 'drizzle-orm'"

**Solution:**

```bash
# Reinstall dependencies
bun install

# Verify drizzle-orm is in backend/package.json
bun run db:migrate
```

### "JWT malformed" or "JsonWebTokenError"

**Solution:**

```bash
# Clear cookies and localStorage
# Check security.jwtPrivateKey in config/*.json
# Restart backend server
```

### "EADDRINUSE: address already in use"

**Solution:**

```bash
# Find process using port
lsof -i :3331  # or :3330

# Kill process
kill -9 <PID>

# Or change ports in config/<app>.json (server.backendPort/server.frontendPort)
```

### "Module not found: Can't resolve"

**Solution:**

```bash
# Clear cache
rm -rf node_modules/.cache
bun install

# Check import paths
# Verify file exists
```

### "CORS policy: No 'Access-Control-Allow-Origin'"

**Solution:**

```bash
# Check CORS configuration in config/{appname}.json
# Verify server.frontendUrl and cors.frontendDevOrigins
# Ensure credentials: true in both frontend and backend
```

---

## 🆘 Getting Help

### Before Asking for Help

1. **Check this troubleshooting guide**
2. **Search existing issues** in the repository
3. **Check the logs** for specific error messages
4. **Try the quick diagnostics** commands above

### Information to Include

When reporting issues, please include:

- **Environment details** (OS, Node.js version, Bun version)
- **Complete error messages** (with stack traces)
- **Steps to reproduce** the issue
- **Expected vs actual behavior**
- **Configuration files** (config/\*.json, package.json)

### Useful Debug Commands

```bash
# System information
node --version && bun --version && echo $NODE_ENV

# Environment variables (sanitized)
env | grep -E "(NODE_|VITE_|DATABASE_|JWT_)" | sed 's/=.*/=***/'

# Package versions
bun pm ls

# Process information
ps aux | grep -E "(node|bun)"

# Network connectivity
curl -I http://localhost:3331/api/v1/health
curl -I http://localhost:3330
```

### Log Files to Check

- **Backend logs:** Console output from `bun run dev:backend`
- **Frontend logs:** Browser console (F12 → Console)
- **Database logs:** Drizzle query logs
- **Docker logs:** `docker compose logs`

---

**For additional support:**

- [Getting Started Guide](GETTING_STARTED.md) - Detailed setup instructions
- [API Documentation](API_REFERENCE.md) - Backend API reference
- [RBAC Documentation](RBAC.md) - Role and permission issues
