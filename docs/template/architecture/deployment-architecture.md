# Deployment Architecture

Docker-based deployment with nginx reverse proxy and supervisord process management.

## Docker Build Pipeline

```mermaid
graph LR
    subgraph "Multi-Stage Build"
        base["base-builder<br/>Bun 1.3.10 Alpine<br/>Install deps"]
        backend["backend-builder<br/>TypeScript compile"]
        frontend["frontend-builder<br/>Vite production build"]
        prod["production<br/>Alpine runtime<br/>nginx + supervisord"]
    end

    base --> backend
    base --> frontend
    backend --> prod
    frontend --> prod
```

## Runtime Architecture

```mermaid
graph TB
    subgraph "Docker Host"
        subgraph "Container :3330"
            sv["supervisord"]

            subgraph "nginx"
                ng_static["Serve /assets/*<br/>(Cache-Control: 1yr)"]
                ng_spa["SPA Fallback<br/>/* → index.html"]
                ng_proxy["Reverse Proxy<br/>/api/* → :3331"]
                ng_ws["WebSocket Proxy<br/>/ws → :3331<br/>(upgrade, 86400s timeout)"]
            end

            subgraph "Bun Process"
                elysia["Elysia HTTP Server :3331"]
                scheduler["Scheduler Service<br/>(cron-based tasks)"]
                ws_server["WebSocket Server<br/>(Bun native pub/sub)"]
            end

            sv --> |"priority 10"| ng_static
            sv --> |"priority 20"| elysia
        end

        subgraph "Volumes"
            db[("data/<br/>spernakit.db")]
            cfg["config/<br/>spernakit.json"]
            log["logs/"]
            bak["backups/"]
        end

        elysia --> db
        elysia --> cfg
        elysia --> log
    end

    internet["Internet"] --> |":3330"| ng_static
```

## Configuration

The application loads configuration from:

1. **Schema defaults** (`backend/src/config/defaults.json`) -- built-in defaults
2. **Config file** (`config/spernakit.json`) -- user overrides merged on top
3. **Zod validation** -- validates merged config at startup

Key configuration sections:

| Section    | Controls                                      |
| ---------- | --------------------------------------------- |
| `server`   | Port, host, CORS origins                      |
| `database` | Path, WAL mode, connection settings           |
| `security` | JWT keys, token expiry, cookie settings, CSRF |
| `security` | CSP, rate limiting, HSTS                      |
| `logging`  | Log level, format                             |
| `email`    | SMTP host, port, credentials                  |
| `storage`  | File upload path, max size, S3 settings       |

## Health Monitoring

```mermaid
graph TB
    scheduler["Scheduler<br/>(every 5 min)"]

    subgraph "Health Checks"
        db_check["Database<br/>SELECT 1"]
        mem_check["Memory<br/>RSS, Heap"]
        fs_check["Filesystem<br/>Disk space"]
    end

    subgraph "Storage"
        logs["health_check_logs"]
        alerts["health_check_alerts"]
        metrics["system_metrics"]
    end

    scheduler --> db_check
    scheduler --> mem_check
    scheduler --> fs_check

    db_check --> logs
    mem_check --> logs
    fs_check --> logs

    db_check --> |"degraded/unhealthy"| alerts
    mem_check --> |"degraded/unhealthy"| alerts

    scheduler --> |"every 60s"| metrics
```
