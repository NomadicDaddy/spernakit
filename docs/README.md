# Documentation

This directory contains all project documentation organized by purpose.

## Directory Structure

### `template/` - Template Documentation

The `template/` subdirectory contains documentation for the Spernakit application template itself. These documents describe:

- **Core Template Features**: Architecture, design patterns, and standard implementations
- **Template Management**: How template updates are propagated to derived applications
- **Configuration**: Template-wide configuration systems and settings authority
- **Customization Guidelines**: Which parts of the code should remain synchronized

**Target Audience**: Template maintainers and developers working on the Spernakit template core.

**Key Files**:

- `STACK.md` - Canonical tech stack reference
- `GETTING_STARTED.md` - Initial setup and quick start guide
- `API_REFERENCE.md` - Complete backend API documentation
- `SECURITY.md` - Consolidated security guide (keys, passwords, auth)
- `RBAC.md` - Role-based access control and data authority
- `CUSTOMIZATION.md` - How to customize the template
- `DEPLOYMENT.md` - Production deployment strategies
- `TROUBLESHOOTING.md` - Common issues and solutions

### Advanced Topics

Advanced development guides are located in `docs/template/`:

- `DEVELOPMENT.md` - Core development patterns and workflows

## Pathing Conventions

- **Template documentation**: Always referenced with `docs/template/` prefix

## Maintenance Guidelines

### Adding Documentation

1. **Template features**: Add to `docs/template/` or `docs/template/advanced/`
2. **App-specific features**: Add to `docs/` root or app-specific location

### Updating Documentation

When updating the template:

1. **Core template changes**: Update relevant `docs/template/` files
2. **Architecture changes**: Update `STACK.md` first
3. **Breaking changes**: Document in `CHANGELOG.md` before releasing
4. **New features**: Add to appropriate documentation section in README.md

### Cross-Documentation References

When referencing other documentation, always use full paths:

- ✅ Correct: `See [Security Guide](docs/template/SECURITY.md)`
- ❌ Incorrect: `See [Security Guide](../template/SECURITY.md)`
- ❌ Incorrect: `See [Security Guide](SECURITY.md)`

### Link Checking

The project includes automated link checking to prevent broken documentation links:

```bash
# Run link checking (if implemented)
bun run check-docs
```

## Documentation Types

### User-Facing Documentation

- **README.md** - Project overview, features, and quick start
- **GETTING_STARTED.md** - Setup instructions and first steps
- **TROUBLESHOOTING.md** - Common issues and solutions

### Developer Documentation

- **API_REFERENCE.md** - Backend API endpoints and schemas
- **DEVELOPMENT.md** - Development patterns and workflows
- **CUSTOMIZATION.md** - Customizing the template

### Architecture Documentation

- **STACK.md** - Technical stack and architecture reference
- **SECURITY.md** - Security architecture and best practices
- **RBAC.md** - Role-based access control and data authority

### Architecture Diagrams (`architecture/`)

Visual Mermaid diagrams documenting the system design:

- [`system-architecture.md`](template/architecture/system-architecture.md) - Container layout, request flow, route modules
- [`frontend-architecture.md`](template/architecture/frontend-architecture.md) - Provider hierarchy, route tree, component structure, state management
- [`backend-architecture.md`](template/architecture/backend-architecture.md) - Plugin chain, service layer, auth flow, WebSocket protocol
- [`database-schema.md`](template/architecture/database-schema.md) - ER diagram, all tables, foreign key cascade behavior
- [`deployment-architecture.md`](template/architecture/deployment-architecture.md) - Docker build pipeline, runtime processes, health monitoring

## Related Documentation

- See [README.md](../README.md) for project overview
- See [CHANGELOG.md](template/CHANGELOG.md) for version history
- See [STACK.md](template/STACK.md) for technical stack documentation
