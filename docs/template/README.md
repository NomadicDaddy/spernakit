# Spernakit Documentation

These documents describe the Spernakit v3.28.2 application template as it ships today. Start with
the guides that match the work you are doing, then use the reference documents for details.

## Start here

- [Getting Started](GETTING_STARTED.md): install, configure, and run the template.
- [Development](DEVELOPMENT.md): coding conventions, architecture patterns, quality gates, and
  template synchronization.
- [Customization](CUSTOMIZATION.md): extend the template without losing its core guarantees.
- [Testing](TESTING.md): run static, integration, browser, and Docker verification.
- [Deployment](DEPLOYMENT.md): prepare and operate a production deployment.

## Architecture and APIs

- [Stack](STACK.md): canonical runtime, dependency, workspace, and architecture reference.
- [API Standard](API_STANDARD.md): route, validation, response, and error conventions.
- [API Reference](API_REFERENCE.md): available backend endpoints.
- [Configuration](CONFIGURATION.md): configuration sources, schemas, and overrides.
- [Settings Guide](SETTINGS_GUIDE.md): application-managed settings.
- [Architecture Decision Records](adr/README.md): accepted design decisions and their rationale.
- [Architecture diagrams](architecture/system-architecture.md): system, frontend, backend,
  database, and deployment views.

## Security and administration

- [Security](SECURITY.md): authentication, key management, password handling, and security
  controls.
- [RBAC](RBAC.md): roles, permissions, and authorization behavior.
- [API Key Authentication](API_KEY_AUTHENTICATION.md): scoped machine access.
- [Database Administration](ADMIN_DB.md): protected schema, query, and data workflows.

## Support and release information

- [Troubleshooting](TROUBLESHOOTING.md): common problems and diagnostic steps.
- [Known Issues](KNOWN_ISSUES.md): current limitations and workarounds.
- [Changelog](CHANGELOG.md): the v3.28.2 public baseline and future release changes.

## Current architecture

Spernakit uses a Bun and TypeScript monorepo with three workspaces:

- `frontend/`: React, React Router, TanStack Query, Zustand, Tailwind CSS, shadcn/ui, and Vite.
- `backend/`: Elysia, Drizzle ORM, cookie-based JWT authentication, WebSockets, and structured
  operational services.
- `shared/`: contracts, schemas, types, and constants consumed by both application layers.

The template includes five-tier role-based access control, audit logging, notifications, file
management, settings, dashboards, database administration, Docker support, and a blocking quality
gate. SQLite and PostgreSQL schemas are maintained in parallel and checked for parity.

## Template lifecycle

Spernakit v3.28.2 is the minimum supported template synchronization source. For a derived app at
that baseline or later, generate a read-only review packet with:

```bash
bun run template:sync-plan -- --app ../<app> --from <source> --to <target>
```

Review pure, branded, infrastructure, and security-infrastructure changes separately. Apply the
approved changes manually, update `spernakit_version`, run `bun install` when dependencies change,
and finish with `bun run smoke:qc`.

## Documentation maintenance

Keep examples aligned with the live source and update the relevant guide in the same change as
the behavior it describes. Run `bun run check-docs` for links and consistency, then run the full
quality gate before release.
