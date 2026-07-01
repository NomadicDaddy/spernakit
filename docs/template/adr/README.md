# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) documenting key architectural decisions in Spernakit.

## What are ADRs?

ADRs capture significant architectural decisions with:

- Context: Why the decision was needed
- Drivers: Requirements and constraints
- Alternatives: Options considered
- Decision: What was chosen and why
- Consequences: Positive and negative implications

## Purpose

ADRs serve as:

- **Historical record**: Document why architecture is the way it is
- **Communication tool**: Share architectural decisions with team
- **Onboarding guide**: Help new developers understand design choices
- **Decision aid**: Prevent revisiting settled debates
- **Living documentation**: Can be updated when architecture evolves

## How to Create a New ADR

1. **Use the template**: Copy `0000-template.md` as starting point
2. **Fill in sections**: Context, drivers, alternatives, decision, consequences
3. **Number sequentially**: Next available number after ADR-008
4. **Link related ADRs**: Reference related decisions
5. **Add to this index**: List new ADR below
6. **Commit with descriptive message**: "Add ADR-009: Decision title"

## ADR Index

| ID                                            | Title                                       | Status   | Date |
| --------------------------------------------- | ------------------------------------------- | -------- | ---- |
| [ADR-001](adr-001-sqlite-database.md)         | SQLite for Production Database              | Accepted |
| [ADR-002](adr-002-cookie-based-jwt-auth.md)   | Cookie-Based JWT Authentication (HTTP-Only) | Accepted |
| [ADR-003](adr-003-rbac-system.md)             | 5-Tier RBAC System Design                   | Accepted |
| [ADR-004](adr-004-websocket-notifications.md) | WebSocket Real-Time Notifications           | Accepted |
| [ADR-005](adr-005-json-configuration.md)      | JSON Configuration System Instead of .env   | Accepted |
| [ADR-006](adr-006-soft-delete-pattern.md)     | Soft Delete Pattern Implementation          | Accepted |
| [ADR-007](adr-007-bun-package-manager.md)     | Bun Package Manager Enforcement             | Accepted |
| [ADR-008](adr-008-component-conventions.md)   | Card/View/Form Component Conventions        | Accepted |

## ADR Status

- **Proposed**: Under consideration, not yet decided
- **Accepted**: Decision made and implemented
- **Deprecated**: Decision replaced by new approach (document superseding ADR)
- **Superseded**: Still valid but replaced by better alternative (reference new ADR)

## Related Documentation

- [Architecture Guide](../STACK.md) - Overall system architecture
- [Development Guide](../DEVELOPMENT.md) - Development workflows and patterns
- [Configuration Guide](../CONFIGURATION.md) - Application configuration details
- [Security Guide](../SECURITY.md) - Security considerations and best practices

## References

- [Architecture Decision Records](https://adr.github.io/) - ADR methodology and templates
- [Markdown ADR Template](0000-template.md) - Template for new ADRs
