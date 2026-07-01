# Backend Architecture

Elysia-based REST API running on Bun with a plugin-oriented middleware stack.

## Plugin Chain

Plugins are registered in order and execute as an onion-model middleware stack:

```mermaid
graph LR
    req["Request"] --> rid["requestId"]
    rid --> log["logger"]
    log --> cors["cors"]
    cors --> sec["securityHeaders"]
    sec --> apk["apiKey"]
    apk --> auth["authPlugin<br/>(derive user)"]
    auth --> pcg["passwordChangeGuard"]
    pcg --> csrf["csrf"]
    csrf --> rl["rateLimit"]
    rl --> arl["authRateLimit"]
    arl --> ws["workspacePlugin<br/>(derive workspace)"]
    ws --> aud["auditPlugin"]
    aud --> handler["Route Handler"]
    handler --> svc["Service Layer"]
    svc --> db["Database"]
```

## Service Layer

Route modules are split by feature domain. Each delegates to a dedicated service. Services are the only layer that accesses the database.

```mermaid
graph TB
    subgraph "Routes (backend/src/routes/)"
        r_auth["auth-login, auth-me,<br/>auth-oauth, auth-refresh,<br/>auth-password-reset, auth-register,<br/>auth-utils"]
        r_users["users-crud, users-bulk,<br/>users-profile, users-api-keys"]
        r_ws_routes["workspaces-crud,<br/>workspaces-members,<br/>workspaces-members-bulk"]
        r_notif["notifications-crud,<br/>notifications-preferences-broadcast"]
        r_dash["dashboards-crud,<br/>dashboards-share-export,<br/>dashboards-templates-import"]
        r_settings["settings-general,<br/>settings-auth-security,<br/>settings-smtp, settings-user,<br/>settings-app-features"]
        r_system["system-dashboard,<br/>system-metrics, system-backup"]
        r_health["health-checks,<br/>health-alerts-config"]
        r_audit["audit"]
        r_tasks["tasks"]
        r_files["files"]
        r_bm["businessmetrics"]
        r_ws["ws, ws-broadcast"]
    end

    subgraph Services
        s_auth["authService"]
        s_users["userService"]
        s_ws_svc["workspaceService"]
        s_notif["notificationService"]
        s_dash["dashboardService"]
        s_settings["settingsService"]
        s_metrics["metricsService"]
        s_health["healthService"]
        s_audit["auditService"]
        s_sched["schedulerService"]
        s_files["fileService"]
        s_bm["businessMetricsService"]
        s_oauth["oauthService"]
        s_email["emailService"]
        s_apikey["apiKeyService"]
        s_smtp["smtpService"]
    end

    r_auth --> s_auth
    r_auth --> s_oauth
    r_users --> s_users
    r_users --> s_apikey
    r_ws_routes --> s_ws_svc
    r_notif --> s_notif
    r_dash --> s_dash
    r_settings --> s_settings
    r_settings --> s_smtp
    r_system --> s_metrics
    r_health --> s_health
    r_audit --> s_audit
    r_tasks --> s_sched
    r_files --> s_files
    r_bm --> s_bm

    subgraph Database
        drizzle["Drizzle ORM<br/>(bun:sqlite)"]
    end

    s_auth --> drizzle
    s_users --> drizzle
    s_ws_svc --> drizzle
    s_notif --> drizzle
    s_dash --> drizzle
    s_settings --> drizzle
    s_metrics --> drizzle
    s_health --> drizzle
    s_audit --> drizzle
    s_sched --> drizzle
    s_files --> drizzle
    s_bm --> drizzle
    s_apikey --> drizzle
    s_smtp --> drizzle
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Auth Routes
    participant S as AuthService
    participant D as Database

    Note over C,D: Login
    C->>A: POST /auth/login {username, password}
    A->>S: login(username, password)
    S->>D: Find user by username
    D-->>S: User record
    S->>S: Verify bcrypt hash
    S->>S: Generate JWT pair (access + refresh)
    S->>D: Store refreshTokenHash
    S-->>A: User + tokens
    A-->>C: Set-Cookie: spernakit_auth, spernakit_refresh

    Note over C,D: Authenticated Request
    C->>A: GET /api/v1/users (Cookie: authToken=...)
    Note over A: authPlugin extracts JWT from cookie
    A->>S: verifyAccessToken(token)
    S-->>A: {id, username, role}

    Note over C,D: Token Refresh
    C->>A: POST /auth/refresh (Cookie: refreshToken=...)
    A->>S: refreshTokens(refreshToken)
    S->>D: Verify hash matches stored hash
    S->>S: Issue new JWT pair (token rotation)
    S->>D: Update refreshTokenHash
    S-->>A: New tokens
    A-->>C: Set-Cookie: spernakit_auth, spernakit_refresh
```

> **Note:** Cookie names `spernakit_auth` and `spernakit_refresh` are defaults from `config.security.cookieNames`. Applications override these in their `spernakit.json` configuration.

## WebSocket Protocol

```mermaid
sequenceDiagram
    participant C as Client
    participant W as WS Handler
    participant P as Pub/Sub

    C->>W: Upgrade (Cookie: authToken)
    W->>W: Authenticate from cookie
    W->>P: Subscribe user:{userId}
    W-->>C: {type: connected, data: {userId, channels}}

    loop Heartbeat
        C->>W: {type: ping}
        W-->>C: {type: pong}
    end

    C->>W: {type: subscribe, channel: workspace:5}
    W->>W: Check workspace membership
    W->>P: Subscribe workspace:5
    W-->>C: {type: subscribed, channel: workspace:5}

    Note over P: Server event triggers broadcast
    P-->>C: {type: notification, data: {...}}

    C->>W: Connection close
    W->>W: Cleanup connection + rate limits
```
