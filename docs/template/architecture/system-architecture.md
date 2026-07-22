# System Architecture

How the Spernakit application is put together and deployed.

## Container Architecture

One Docker container runs two processes under supervisord:

```mermaid
graph TB
    subgraph Docker Container
        direction TB
        supervisord["supervisord"]

        subgraph "nginx :3330"
            direction LR
            static["Static Files<br/>/assets/* (1y cache)"]
            spa["SPA Fallback<br/>/* → index.html"]
            proxy_api["/api/* → :3331"]
            proxy_ws["/ws → :3331<br/>(WebSocket upgrade)"]
        end

        subgraph "Bun Runtime :3331"
            direction TB
            elysia["Elysia Server"]
            api["REST API<br/>/api/v1/*"]
            ws["WebSocket<br/>/ws"]
        end

        supervisord --> |priority 10| static
        supervisord --> |priority 20| elysia
        elysia --> api
        elysia --> ws
    end

    client["Browser Client"] --> |HTTP / WSS| static
    client --> |/api/*| proxy_api
    client --> |/ws| proxy_ws
    proxy_api --> api
    proxy_ws --> ws

    subgraph Volumes
        data[("/app/data<br/>SQLite DB")]
        config[("/app/config<br/>spernakit.json")]
        logs[("/app/logs")]
        backups[("/app/backups")]
    end

    elysia --> data
    elysia --> config
    elysia --> logs
```

## Request Flow

Each HTTP request travels this path through the middleware stack:

```mermaid
sequenceDiagram
    participant C as Client
    participant N as nginx
    participant P as Plugin Chain
    participant R as Route Handler
    participant S as Service
    participant D as Database

    C->>N: HTTP Request
    N->>P: Proxy to :3331

    Note over P: requestIdPlugin
    Note over P: loggerPlugin (start)
    Note over P: corsPlugin
    Note over P: securityHeadersPlugin
    Note over P: apiKeyPlugin
    Note over P: authPlugin (derive user)
    Note over P: passwordChangeGuardPlugin
    Note over P: csrfPlugin
    Note over P: rateLimitPlugin
    Note over P: authRateLimitPlugin
    Note over P: workspacePlugin (derive workspace)
    Note over P: auditPlugin

    P->>R: Route Handler
    R->>S: Service Call
    S->>D: Database Query
    D-->>S: Result
    S-->>R: Domain Object
    R-->>P: Response
    Note over P: loggerPlugin (end)
    P-->>N: Response
    N-->>C: Response
```

## Backend Route Modules

All API routes are registered under `/api/v1/`:

| Module Group     | Route Files                                                                                                                      | Prefix              | Purpose                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------ |
| Auth             | `auth-login`, `auth-me`, `auth-oauth`, `auth-refresh`, `auth-password-reset`, `auth-register`, `auth-verify-email`, `auth-utils` | `/auth`             | Login, logout, refresh, OAuth, reset |
| Users            | `users-crud`, `users-bulk`, `users-profile`, `users-api-keys`                                                                    | `/users`            | User CRUD, batch ops, API keys       |
| Workspaces       | `workspaces-crud`, `workspaces-members`, `workspaces-members-bulk`                                                               | `/workspaces`       | Workspace CRUD, member management    |
| Notifications    | `notifications-crud`, `notifications-preferences-broadcast`                                                                      | `/notifications`    | Notification CRUD, preferences       |
| Dashboards       | `dashboards-crud`, `dashboards-share-export`, `dashboards-templates-import`                                                      | `/dashboards`       | Dashboard CRUD, sharing, templates   |
| Settings         | `settings-general`, `settings-auth-security`, `settings-smtp`, `settings-user`, `settings-app-features`                          | `/settings`         | Application and auth settings        |
| System           | `system-dashboard`, `system-metrics`, `system-backup`                                                                            | `/system`           | Dashboard stats, metrics, backups    |
| Health           | `health-checks`, `health-alerts-config`                                                                                          | `/health`           | Health checks, alert configuration   |
| Audit            | `audit`                                                                                                                          | `/audit`            | Audit log queries                    |
| Tasks            | `tasks`                                                                                                                          | `/tasks`            | Scheduled task management            |
| Files            | `files`                                                                                                                          | `/files`            | File upload and download             |
| Database Admin   | `database-admin`                                                                                                                 | `/database-admin`   | Schema introspection, data viewer    |
| Onboarding       | `onboarding`                                                                                                                     | `/onboarding`       | First-run onboarding wizard          |
| Bugs             | `bugs`                                                                                                                           | `/bugs`             | Bug reporting                        |
| Business Metrics | `businessmetrics`                                                                                                                | `/business-metrics` | Business event analytics             |
| WebSocket        | `ws` (`routes/ws/ws.ts`, `routes/ws/index.ts`), broadcast via `services/websocket/wsBroadcast.ts`                                | `/ws` (root-level)  | Real-time channel, broadcasting      |
