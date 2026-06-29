# Spernakit Security Guide (Canonical)

## Table of Contents

1. Overview & Principles
2. Token Security (Password Reset)
3. Security Services Integration (How-To)
4. Password Policy
5. Key Generation & Management
6. Key Rotation (Critical Procedures)
7. Operational Remediation Plan (Checklist)
8. Database Indexes & Performance
9. Telemetry, Auditing, and Monitoring
10. Environment & Configuration
11. Troubleshooting
12. References (Code Paths)

---

## 1) Overview & Principles

Spernakit provides opinionated, production-focused security patterns **optimized for air-gapped and self-hosted environments**:

- Strong password policy and server-side validation
- Secure token lifecycle (generation, storage, verification, cleanup)
- Hardened authentication/session practices
- Audit/telemetry for security-relevant operations
- Manual procedures for high-risk activities (e.g., encryption key rotation)
- Static configuration via JSON config files (no runtime changes)

### Design Tenets

- **Fail fast in development**: Explicit errors with actionable messages
- **Consistent API error shape**: `{ success, error, message, details?, data? }`
- **Simplified for air-gapped**: Removed multi-tenant SaaS complexity
- **Least-privilege access**: Well-defined RBAC with role hierarchy
- **Manual over automated**: Scheduled maintenance is acceptable and preferred
- **Static configuration**: All settings via JSON config files at deployment time

### Air-Gapped Optimizations

Spernakit has been simplified specifically for air-gapped deployments by removing:

- Database SMTP configuration (environment variables only)
- JWT audience/issuer claims complexity (audience and issuer are included, set from frontendUrl and backendUrl in config)
- Cookie domain configuration (single domain)
- Complex key strength validation (basic checks sufficient)
- Automated key rotation infrastructure (manual process documented)

**Result**: 32% code reduction (~315 lines) while maintaining all essential security controls.

---

## 2) Token Security (Password Reset)

### Generation

- Use crypto-secure random: 32 bytes (256 bits) → hex string
- Plaintext token is only ever sent to the user (via email link)

Example (conceptual):

- generate: crypto.randomBytes(32).toString('hex')

### Storage

- Generate plaintext token (sent to user via email link)
- Store SHA-256 hash of token in `User.resetToken` with `resetTokenExpiresAt` (DateTime, 15 mins default)
- Plaintext token is never persisted — only the hash is stored in the database
- On verification, hash the incoming token and compare against stored hash

### Verification

- Hash the incoming token with SHA-256
- Look up user by matching hash against `User.resetToken`
- Validate expiry (`resetTokenExpiresAt > now`)
- Single-use: on success, update password then clear `resetToken`/`resetTokenExpiresAt`

### Protections

- Email enumeration prevention: always return generic success on request
- Rate limiting per IP for reset requests
- Duplicate prevention: no multiple active tokens per user (a new request overwrites any prior token)
- Single-use enforcement: token hash is cleared in the same transaction that updates the password

### Cleanup

- Automated periodic job clears expired tokens
- On password change, proactively clear any tokens for that user

---

## 3) Security Services Integration (How-To)

These services are ready-to-use and intended to be integrated at well-defined points:

- **validatePasswordStrength** (server, `backend/src/utils/auth/passwordValidation.ts`): shared password validation (length and complexity). Used by registration, password reset, password change, and user creation flows.
- **authSecurityService** (server): comprehensive authentication security including failed-attempt tracking, lockout, password expiry, suspicious-activity hooks, and security event tracking. Use in auth flows (login, failed login recording, unlock on success). Integrated into login flow.
- **emailService** (server): transactional email delivery (password reset, email verification, email change confirmation/notification).
- **AuditService** (server): comprehensive audit logging for all security-relevant operations. Tracks user actions, security events, and system changes.
- **SecureSeeding** (server): secure default users and password generation; generate templates for environment secrets.

### Account Lockout & Password Expiry

**Account Lockout**:

- Tracks failed login attempts per user
- Locks account after N failed attempts (configurable via `MAX_LOGIN_ATTEMPTS`)
- Lockout duration configurable via `ACCOUNT_LOCKOUT_DURATION` (minutes)
- Admin tools available to manually unlock accounts
- Audit logging for all lockout events

**Password Expiry**:

- Tracks password age via `passwordChangedAt` field
- Enforces password expiry after N days (configurable via `PASSWORD_EXPIRY_DAYS`)
- Forces password change on next login
- Admin tools available to reset password expiry
- Audit logging for all password change events

**Admin Security Tools**:

- View user security status (failed attempts, lockout status, password age)
- Manually unlock locked accounts
- Reset password expiry for users
- Force password change on next login
- All admin actions are audit logged

Typical integration examples:

- Validate password in userService on create/update; reject with details when invalid.
- In auth route handler: check lockout and password expiry before auth; on failure record attempt; on success clear attempts.
- Use UserSecurityView page in frontend to manage user security settings.

---

## 4) Password Policy

### Requirements

All passwords must meet:

- **Length**: 8-128 characters
- **Complexity**: At least one lowercase letter, one uppercase letter, and one number
- **Special character**: Required by default; admins can toggle this via the auth security settings (`requireSpecialCharacter`, default on)

### Implementation

**Backend**: `backend/src/utils/auth/passwordValidation.ts` - Server-side validation
**Frontend**: Password validation is backend-only; there is no separate frontend validation module

### Validation

Password validation is integrated into the registration, password change, and user creation flows. There is no standalone password validation endpoint. The backend validates passwords server-side during these operations using `backend/src/utils/auth/passwordValidation.ts`.

---

## 5) Key Generation & Management

### Quick Start

```bash
bun run generate-keys
```

Generates cryptographically secure keys and writes them to `config/{appname}.json` under `security.*`.

### Key Types

| Key                    | Purpose                                               | Format                   |
| ---------------------- | ----------------------------------------------------- | ------------------------ |
| `jwtPrivateKey`        | JWT signing (ES256)                                   | EC P-256 PEM private key |
| `jwtPublicKey`         | JWT verification                                      | EC P-256 PEM public key  |
| `jwtRefreshPrivateKey` | Refresh token signing                                 | EC P-256 PEM private key |
| `jwtRefreshPublicKey`  | Refresh token verify                                  | EC P-256 PEM public key  |
| `encryptionKey`        | AES-256-GCM encryption                                | 64 hex chars (32 bytes)  |
| `cookieSecret`         | HKDF input for OAuth state/PKCE binding (not cookies) | 32+ chars                |

### Manual Configuration

Run `bun run generate-keys` to auto-generate all keys, or edit `config/{appname}.json`:

```json
"security": {
  "jwtPrivateKey": "-----BEGIN PRIVATE KEY-----\n...",
  "jwtPublicKey": "-----BEGIN PUBLIC KEY-----\n...",
  "encryptionKey": "64-hex-chars-here",
  "cookieSecret": "your-cookie-secret"
}
```

### Best Practices

- Use different keys per environment (dev/staging/production)
- Store production keys in secure key management systems (AWS Secrets Manager, Azure Key Vault)
- Rotate keys quarterly in production
- Never commit production secrets to version control

---

## 6) Key Rotation (Air-Gapped Manual Process)

**CRITICAL WARNING**: Rotating ENCRYPTION_KEY without migrating encrypted data renders that data unreadable. Plan carefully.

**Air-Gapped Approach**: Manual key rotation with scheduled maintenance windows is the standard process.

### Key Types and Impact

- **JWT Key Pairs** → Invalidates all sessions; users must re-login; no data migration required
- **ENCRYPTION_KEY** → Requires decrypt/re-encrypt of all affected data; downtime required
- **COOKIE_SECRET** → Invalidates in-flight OAuth login flows (state/PKCE binding); session cookies are unaffected (they carry unsigned JWTs verified against the JWT keys)

### Manual Rotation Procedure (Production)

1. **Pre-Rotation Checklist**
    - ✅ Create and verify database backup
    - ✅ Identify all encrypted data in database
    - ✅ Schedule maintenance window (notify users)
    - ✅ Test procedure in staging environment
    - ✅ Prepare rollback plan

2. **Rotation Steps**
    - Stop application services
    - Generate new keys: `bun run generate-keys`
    - Keys are automatically updated in `config/{appname}.json`
    - If ENCRYPTION_KEY changed: Run data migration script (decrypt with old key, re-encrypt with new key)
    - Restart application services

3. **Post-Rotation Validation**
    - ✅ Health checks pass
    - ✅ Encrypted data loads correctly
    - ✅ Users can sign in
    - ✅ Performance is stable

4. **Rollback Plan**
    - Stop application
    - Restore database backup
    - Restore previous `config/{appname}.json` (from backup)
    - Restart and validate

### Why Manual is Better for Air-Gapped

- **Scheduled maintenance is normal** in air-gapped environments
- **Simpler process** reduces complexity and potential errors
- **Better control** with full visibility into each step
- **No surprises** - clear, documented steps with no automation
- **Smaller datasets** make migration more manageable

**Staging-First Rule**: Always prove the procedure on staging with realistic data volume before production.

---

## 7) Operational Remediation Plan (Checklist)

The following summarizes the previously separate remediation plan into a single actionable list. Track status in your issue tracker.

Critical (immediate):

- [ ] Enforce password policy server-side for all create/update flows
- [ ] Ensure secure hashing + constant-time verification for reset tokens
- [ ] Ensure session/cookie security aligned to environment
- [ ] Server-side authorization (role hierarchy, resource checks)
- [ ] Security monitoring/logging enabled

Authentication hardening:

- [ ] Account lockout thresholds and durations configured
- [ ] Failed login telemetry captured with minimal PII
- [ ] Password reset rate limits in place

Data protection:

- [ ] Confirm encryption key validation at startup (length/strength)
- [ ] Avoid storing sensitive data in plaintext anywhere (DB/logs)

Production security:

- [ ] Security headers (Elysia `securityHeaders` plugin — `backend/src/plugins/securityHeaders.ts`) configured
- [ ] CORS restricted to allowed origins
- [ ] Database backups verified; recovery tested
- [ ] Penetration/security testing cadence defined

Testing:

- [ ] Unit tests for password policy, authorization rules
- [ ] Integration tests for auth/session flows
- [ ] Regression tests for token lifecycle

---

## 8) Database Indexes & Performance

Token lookup performance:

- `resetToken` carries a `UNIQUE` constraint in `backend/src/db/schema/users.ts`, which gives SQLite an implicit unique index. Token verification is a single indexed lookup by hash; expiry is validated on the fetched row.
- There is no separate index on `resetTokenExpiresAt`; expired-token cleanup scans the column, which is fine at self-hosted user counts.

---

## 9) Telemetry, Auditing, and Monitoring

### Audit Logging

Comprehensive audit logging system tracks all security-relevant operations:

**Audit Log Schema**:

- `action` - Action performed (e.g., LOGIN, LOGOUT, USER_CREATED, ACCOUNT_LOCKED)
- `resource` - Resource type affected (e.g., user, role, setting)
- `resourceId` - ID of affected resource
- `userId` - User who performed the action
- `ipAddress` - IP address of request
- `details` - JSON object with additional context (old values, new values, metadata)
- `timestamp` - When the action occurred

**Audit Log Viewer**:

- Available in Settings > Audit Logs (ADMIN+ only)
- Filter by action, resource, user ID
- Pagination support (50 logs per page)
- Expandable JSON details
- Color-coded badges for actions and resources

**Automatically Logged Events**:

- Authentication: login, logout, failed login, account locked, account unlocked
- User management: create, update, delete, role change
- Password: change, reset, expiry
- Security: lockout, unlock, password expiry reset
- Settings: configuration changes
- All admin security actions

**Security Monitoring**:

- Emit audit entries when cleanup jobs run, including counts of cleared tokens
- Record lockouts, failed attempts, and suspicious activity via centralized audit service
- Provide a security health endpoint (restricted to SYSOP/ADMIN) summarizing:
    - Cleanup service status (running, interval, next run)
    - Active/expired token counts
    - Recommendations and recent security signals
    - Recent security events from audit logs

---

## 10) Environment & Configuration (Air-Gapped)

### Configuration Hierarchy

Spernakit uses a **JSON-first configuration approach**:

1. **Primary Source**: `config/{appname}.json` - All configuration settings
2. **Runtime Environment**: `process.env` - Populated from JSON by `load-json-config.ts` for scripts
3. **No `.env` Files**: Bun config has `env = false` in `bunfig.toml`, so `.env` files are NOT auto-loaded
4. **Type Validation**: Zod schemas in `configSchemas/` enforce configuration structure

This approach provides:

- Consistent configuration across deployment environments
- Version-controlled configuration files
- No need for runtime environment variable injection
- Easier debugging with visible config files

### Configuration Approach

**JSON-First Configuration**:

Spernakit uses JSON configuration files as the single source of truth:

```json
config/{appname}.json  # Primary configuration file
```

**Scripts Use Environment Variables**:

Scripts (e.g., load-json-config.ts) read from JSON and populate `process.env` for compatibility with existing code. However, `.env` files are NOT auto-loaded because `bunfig.toml` has `env = false`.

**Key Settings in JSON Config**:

- **Database**: `"database.url": "file:./data/<app>.db"`
- **Ports**: `"server.backendPort": 3331`, `"server.frontendPort": 3330`
- **URLs**: `"server.frontendUrl"`, `"server.backendUrl"`
- **Email**: SMTP settings under `"email"` section
- **Security Keys**: `"security.jwtPrivateKey"`, `"security.jwtPublicKey"`, `"security.encryptionKey"`, `"security.cookieSecret"`
- **Password Policy**: Security settings for passwords
- **Account Security**: Lockout and expiry settings
- **Rate Limiting**: Auth request limits
- **CORS**: `"cors.frontendDevOrigins"` for allowed origins

See `config/example.json` for the complete configuration structure.

### Security Defaults (Air-Gapped)

- **Production cookies**: `secure: true`, `sameSite: 'strict'`
- **Static configuration**: All settings via JSON config files (no runtime changes)
- **No external dependencies**: SMTP must be configured in JSON config at deployment time
- **Fail-fast**: Application refuses to start with missing/weak keys in config
- **Database admin panel off by default**: `databaseAdmin.enabled` (default `false`) gates the SYSOP database-admin panel (raw table read/write and SQL sandbox); deployments must opt in explicitly, recommended for development environments only
- **Never commit secrets**: Use secret management or secure JSON config files

---

## 11) Troubleshooting

Invalid reset token:

- Check expiry; verify SHA-256 hash matches stored value; confirm token has not been used.

Cleanup not running:

- Verify service initialization and interval; check logs and environment gating.

High expired token count:

- Reduce interval or investigate cleanup failures; validate indexes exist.

Key rotation failure:

- Stop app; restore backups (see [DEPLOYMENT.md → Rollback and Recovery](DEPLOYMENT.md#-rollback-and-recovery)); verify keys; complete migration; retry in staging first.

---

## 12) References (Code Paths)

**Core Security Services**:

- Password validation: `backend/src/utils/auth/passwordValidation.ts`
- Auth security: `backend/src/services/auth/authSecurityService.ts`
- Security emails: `backend/src/services/emailService.ts`
- Audit logging: `backend/src/services/auditService.ts`
- Secure seeding: `backend/src/db/seed/`

**Auth Services**:

- Auth core (includes token logic): `backend/src/services/auth/authCore.ts`
- Email service: `backend/src/services/emailService.ts`
- Password reset: `backend/src/services/auth/authPasswordReset.ts`
- Demo accounts: `backend/src/services/demoService.ts`

**User Services**:

- User queries: `backend/src/services/user/userAuthQueries.ts`
- User validation: `backend/src/services/user/userValidationService.ts`

**Routes & Guards**:

- Auth flows: `backend/src/routes/auth/` (directory with `index.ts`), `backend/src/services/authService.ts`
- User management: `backend/src/services/userService.ts`
- Audit logs: `backend/src/routes/audit.ts`

**Frontend Pages**:

- Audit logs viewer: `frontend/src/pages/settings/AuditLogsPage.tsx`
- Authentication settings: `frontend/src/pages/settings/AuthenticationSettings.tsx`

**Database**:

- Drizzle schema: `backend/src/db/schema/` (e.g., `users.ts`, `auditLogs.ts`)
- Schema changes applied via Drizzle schema push (no migration files)

**Utilities**:

- Response shape helpers: `backend/src/utils/apiResponse.ts` and `backend/src/utils/errorResponse.ts`
- Role guard: `backend/src/guards/role.ts`
- Security headers plugin: `backend/src/plugins/securityHeaders.ts`

---

Maintenance note: Keep this file current when security-related code changes. Prefer linking to this doc from READMEs and runbooks.
