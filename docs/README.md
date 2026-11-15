# Documentation

Project documentation, organized by purpose.

## Directory Structure

### `template/` - Template Documentation

`template/` holds the documentation for the Spernakit template itself. These docs cover:

- **Core template features**: architecture, design patterns, and standard implementations
- **Template management**: how updates propagate to derived applications
- **Configuration**: template-wide configuration and settings authority
- **Customization guidelines**: which parts of the code should stay in sync

**Audience**: template maintainers and anyone working on the Spernakit core.

**Key files**:

- `STACK.md` - canonical tech stack reference
- `GETTING_STARTED.md` - setup and quick start
- `API_REFERENCE.md` - backend API documentation
- `SECURITY.md` - security guide (keys, passwords, auth)
- `RBAC.md` - role-based access control and data authority
- `CUSTOMIZATION.md` - how to customize the template
- `DEPLOYMENT.md` - production deployment
- `TROUBLESHOOTING.md` - common issues and solutions

### Advanced Topics

More development guides live in `docs/template/`:

- `DEVELOPMENT.md` - core development patterns and workflows

### `scripts/smokestack/docs/` - Delivered Fleet References

`scripts/smokestack/docs/` holds fleet reference documents delivered by smokestack so the paths
this repository's tooling cites resolve locally.

- `gate-conventions.md` - the eight rules every `check*` gate follows, and the six-part shape for
  changing one. Canonical copy: `aidd/docs/reference/gate-conventions.md`. Enforced here by
  `bun run check:gate-conventions`.

**Audience**: anyone writing or changing a gate in this repository.

## Pathing Conventions

Repository paths in prose start at the repository root: `docs/template/` holds template guides and
`scripts/smokestack/docs/` holds delivered fleet references. Markdown link targets are relative to
the file containing the link, so use `docs/template/` from the root README and `template/` from this
file.

## Maintenance Guidelines

### Adding Documentation

1. **Template features**: add to `docs/template/` or `docs/template/advanced/`
2. **App-specific features**: add to `docs/` root or an app-specific location

### Updating Documentation

When updating the template:

1. **Core template changes**: update the relevant `docs/template/` files
2. **Architecture changes**: update `STACK.md` first
3. **Release changes**: document in `CHANGELOG.md` before releasing
4. **New features**: add to the right section in README.md

### Cross-Documentation References

Resolve each link from the document that contains it:

- From root `README.md`: `See [Security Guide](docs/template/SECURITY.md)`
- From this `docs/README.md`: `See [Security Guide](template/SECURITY.md)`
- From `docs/template/DEVELOPMENT.md`: `See [Security Guide](SECURITY.md)`
- From this file to a delivered reference:
  `See [Gate Conventions](../scripts/smokestack/docs/gate-conventions.md)`

### Link Checking

The project includes automated link checking to catch broken documentation links:

```bash
# Run link checking
bun run check:docs
```

## Documentation Types

### User-Facing Documentation

- **README.md** - project overview, features, and quick start
- **GETTING_STARTED.md** - setup instructions and first steps
- **TROUBLESHOOTING.md** - common issues and solutions

### Developer Documentation

- **API_REFERENCE.md** - backend API endpoints and schemas
- **DEVELOPMENT.md** - development patterns and workflows
- **CUSTOMIZATION.md** - customizing the template

### Architecture Documentation

- **STACK.md** - technical stack and architecture reference
- **SECURITY.md** - security architecture and best practices
- **RBAC.md** - role-based access control and data authority

### Architecture Diagrams (`architecture/`)

Mermaid diagrams of the system design:

- [`system-architecture.md`](template/architecture/system-architecture.md) - container layout, request flow, route modules
- [`frontend-architecture.md`](template/architecture/frontend-architecture.md) - provider hierarchy, route tree, component structure, state management
- [`backend-architecture.md`](template/architecture/backend-architecture.md) - plugin chain, service layer, auth flow, WebSocket protocol
- [`database-schema.md`](template/architecture/database-schema.md) - ER diagram, tables, foreign key cascade behavior
- [`deployment-architecture.md`](template/architecture/deployment-architecture.md) - Docker build pipeline, runtime processes, health monitoring

## Related Documentation

- [README.md](../README.md) - project overview
- [CHANGELOG.md](template/CHANGELOG.md) - current public baseline and future release changes
- [STACK.md](template/STACK.md) - technical stack documentation
