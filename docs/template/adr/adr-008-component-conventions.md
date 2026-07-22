# ADR-008: Card/View/Form Component Conventions

## Status

Accepted

## Context

As the Spernakit template has grown, frontend entity pages have developed inconsistent patterns for organizing components. Specific problems observed:

- **Split locations**: Entity-specific components scattered between `components/{entity}/` and `pages/{entity}/` with no clear placement rule (e.g., `UserSecurityModal` in `components/users/` while `UserCreateModal` is in `pages/users/`)
- **Inconsistent modal handling**: Some modals use the shared `Modal` component while others manage their own `<dialog>` element with duplicate escape-key, backdrop-click, and accessibility logic
- **Ambiguous naming**: Modal components named `*Modal` regardless of whether they display read-only detail (a view) or a data-entry form, making it hard to identify component purpose from the filename
- **No documented convention**: New entity pages created ad hoc without reference patterns, leading to divergent structures across entities

These inconsistencies slow developers down and make it harder to onboard new contributors or add new entities consistently.

## Decision Drivers

- **Discoverability**: Developers should locate any entity's components quickly without searching multiple directories
- **Consistency**: All entity pages should follow the same organizational structure
- **Reduced duplication**: Modal behavior (escape, backdrop, accessibility) should not be reimplemented per component
- **Clear purpose**: Component names should indicate whether they are a list view, detail view, or data-entry form
- **Scalability**: The convention must work for entities with full CRUD and entities with only a subset of concerns

## Considered Alternatives

### Alternative 1: Strict suffix enforcement

Require all components to use mandatory suffixes: `*Card`, `*View`, `*Form`.

Pros:

- Maximum consistency
- Trivially searchable by suffix

Cons:

- Forces unnatural names (e.g., `UserCard` when it's actually a table)
- Doesn't accommodate existing patterns like `*Table`, `*Item`, `*Tab`
- Rigid - breaks when components don't fit neatly into one category

### Alternative 2: No convention (status quo)

Continue with organic, ad-hoc component organization.

Pros:

- No migration work
- Maximum flexibility

Cons:

- Inconsistency grows with each new entity
- Duplicate modal logic persists and diverges
- Onboarding friction increases over time
- No reference pattern for new entities

### Alternative 3: Role-based convention with semantic naming (Selected)

Define Card/View/Form as conceptual roles with recommended (not mandatory) suffixes. Consolidate entity components under `pages/{entity}/`. Require all modals to use the shared `Dialog` component.

Pros:

- Clear roles while allowing domain-appropriate naming
- Consolidates entity components in one location
- Eliminates duplicate modal logic
- Provides reference patterns without being overly rigid

Cons:

- Requires one-time migration of existing components
- Semantic naming still requires some judgment

## Decision Outcome

Chosen alternative: **Role-based convention with semantic naming**

**Why this alternative was chosen:**

- Balances consistency with pragmatism - roles are clearly defined but naming accommodates domain terminology
- The directory consolidation rule (`pages/{entity}/` for entity-specific, `components/` for shared-only) is simple and unambiguous
- The shared `Dialog` requirement eliminates a concrete source of code duplication and behavioral inconsistency
- The convention is documented with a worked example, making it straightforward to follow for new entities

## Consequences

### Positive

- All entity components findable in one directory (`pages/{entity}/`)
- Component purpose identifiable from filename (View vs Form distinction)
- All modals share consistent behavior via the shared `Dialog` component (Radix UI)
- New entities have a clear reference pattern to follow
- Barrel files provide clean import paths

### Negative

- ~~One-time migration effort to move `components/users/` and `components/settings/` contents~~ (completed - all entity components now live under `pages/{entity}/`)
- ~~Refactoring three existing modals to use the shared `Dialog` component~~ (completed)
- Developers must learn the convention (mitigated by documentation)

## Related ADRs

- [ADR-006](adr-006-soft-delete-pattern.md): Soft delete pattern (entity data pattern referenced by Card/View components)
- [ADR-003](adr-003-rbac-system.md): RBAC system (permission-based rendering in Card/List components)
