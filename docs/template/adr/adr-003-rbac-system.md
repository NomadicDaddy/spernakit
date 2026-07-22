# ADR-003: 5-Tier RBAC System Design

## Status

Accepted

## Context

Applications need granular access control to restrict functionality by user role. We needed an authorization system that:

- Provides hierarchical role structure (higher roles inherit lower permissions)
- Supports clear permission definitions
- Is easy to understand and maintain
- Maps well to real-world organizational hierarchies
- Allows fine-grained permission checking
- Integrates with JWT authentication system
- Prevents privilege escalation attacks

## Decision Drivers

- **Hierarchical permissions**: Higher roles should automatically have lower role permissions
- **Clear semantics**: Roles should map to organizational positions
- **Prevent escalation**: Users cannot grant themselves higher privileges
- **Maintainable**: Adding new permissions should not require code changes in many places
- **Type-safe**: TypeScript should catch permission errors at compile time
- **Backend enforcement**: All API endpoints must enforce authorization
- **Frontend protection**: UI should hide unauthorized features

## Considered Alternatives

### Alternative 1: Simple Boolean Flags (isAdmin, isUser, etc.)

Pros:

- Very simple to implement
- Easy to understand
- Minimal code complexity

Cons:

- **No granularity**: Can't express "can read users but not delete"
- **Not hierarchical**: Adding new roles requires updating all checks
- **Doesn't scale**: Can't represent complex permission matrices
- **No inheritance**: Each role requires explicit permission assignment

### Alternative 2: Permission-Based (RBAC without Roles)

Pros:

- Maximum flexibility
- Individual user permissions possible
- No role hierarchy needed

Cons:

- **Very complex**: Each user has custom permission set
- **Maintenance nightmare**: Managing individual permissions at scale
- **No organizational mapping**: Doesn't reflect real-world structure
- **Difficult to audit**: Hard to understand what each user can do
- **Poor UX**: Admin users would need complex permission assignment UI

### Alternative 3: 2-Tier System (Admin/Non-Admin)

Pros:

- Simple to understand
- Easy to implement
- Clear boundary

Cons:

- **Too coarse**: Can't differentiate between different user types
- **No middle ground**: Only admin or regular user
- **Poor mapping**: Real organizations have more complex structures
- **Difficult to extend**: Adding new roles requires fundamental changes

### Alternative 4: 3-Tier System (Admin/Manager/User)

Pros:

- Better mapping to typical organizations
- Clear hierarchy

Cons:

- **Still limited**: Can't represent system operators or read-only viewers
- **Missing roles**: No dedicated operations team role
- **Limited granularity**: Can't separate different types of management

### Alternative 5: 5-Tier Hierarchy (Selected)

Pros:

- **Clear hierarchy**: SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER
- **Organizational mapping**: Maps well to real companies (exec, admin, manager, ops, viewer)
- **Hierarchical permissions**: Higher roles automatically have lower permissions
- **Granular control**: Each role has specific, well-defined capabilities
- **Prevents escalation**: Clear rules about who can grant what
- **Type-safe**: TypeScript constants catch permission errors
- **Easy to extend**: Adding new roles fits into hierarchy
- **Good for auditing**: Clear permission matrix for all roles

Cons:

- More complex than simple boolean flags
- Requires careful permission design
- Learning curve for understanding hierarchy

## Decision Outcome

Chosen alternative: 5-tier RBAC system with hierarchical permissions

**Why this alternative was chosen:**

1. **Organizational Mapping**: The 5-tier hierarchy maps directly to real-world companies:
    - **SYSOP**: System operators, infrastructure team (full system access)
    - **ADMIN**: Application administrators (manage users, settings, configuration)
    - **MANAGER**: Team managers (manage users in their area, view reports)
    - **OPERATOR**: Regular operators (perform day-to-day operations)
    - **VIEWER**: Read-only access (dashboards, reports only)

2. **Automatic Permission Inheritance**: Higher roles automatically inherit lower role permissions through numeric hierarchy (SYSOP: 5, ADMIN: 4, MANAGER: 3, OPERATOR: 2, VIEWER: 1). A single comparison `userRoleLevel >= requiredRoleLevel` handles all authorization checks.

3. **Privilege Escalation Prevention**: Clear rules prevent users from:
    - Granting themselves higher roles (SYSOP only can grant ADMIN roles)
    - Modifying users with equal or higher roles
    - Changing system configuration beyond their level

4. **Type-Safe Implementation**:
    - TypeScript constants for each role
    - Numeric hierarchy defined in `ROLE_HIERARCHY` object
    - `hasMinimumRole()` function in `shared/src/roles.ts` (shared workspace, available to both backend and frontend)
    - Compilation catches permission errors

5. **Frontend and Backend Enforcement**:
    - Backend: Guards (`requireAuth()`, `requireRoleFresh()`) in `backend/src/guards/role.ts` enforce permissions on Elysia API endpoints
    - Frontend: `useAuthorization()` hook in `frontend/src/hooks/useAuthorization.ts` checks permissions in components
    - Dual enforcement gives defense in depth

6. **Centralized Role Hierarchy**: Role hierarchy is centrally defined in `shared/src/roles.ts` with `ROLE_HIERARCHY` constant and `hasMinimumRole` utility function. Additional guard-level utilities (`canModifyRole`, `isSysop`, `assertUser`) are in `backend/src/guards/role.ts`.

7. **Clear Business Logic**:
    - SYSOP: System-level operations (restart services, view all metrics, manage health checks)
    - ADMIN: User management, settings management, viewing all audit logs
    - MANAGER: Manage users below them, view team activity, approve changes
    - OPERATOR: Perform operations, view data, edit their own profile
    - VIEWER: Read-only dashboards, reports, metrics (no write access)

## Implementation Details

### Role Hierarchy

```typescript
const ROLE_HIERARCHY = {
	SYSOP: 5,
	ADMIN: 4,
	MANAGER: 3,
	OPERATOR: 2,
	VIEWER: 1,
};

// Permission check
function hasRolePermission(userRole: Role, requiredRole: Role): boolean {
	return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
```

### Authorization Model

Authorization is purely role-level - there are no granular string-based permissions. Each endpoint requires a minimum role level, and higher roles inherit all lower role capabilities. For example, an endpoint guarded with `requireRoleFresh('MANAGER')` is accessible to MANAGER, ADMIN, and SYSOP.

### Guard Enforcement

```typescript
// backend/src/guards/role.ts

// Re-validates role from database (for sensitive operations)
requireRoleFresh(minimumRole: UserRole)

// Basic authentication check (any logged-in user)
requireAuth()

// Guard-level utilities (backend/src/guards/role.ts)
canModifyRole(actorRole: UserRole, targetRole: UserRole): boolean
isSysop(role: UserRole): boolean
assertUser(user: AuthUser | null): asserts user is AuthUser

// Shared utilities (shared/src/roles.ts)
hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean
validateUserRole(role: string): UserRole | null
```

### Frontend Hook

```typescript
// frontend/src/hooks/useAuthorization.ts
function useAuthorization() {
	return {
		can: (minimumRole: UserRole) => boolean, // Has minimum role level
		hasMinRole: (minimumRole: UserRole) => boolean, // Alias for can
		hasRole: (role: UserRole) => boolean, // Has exactly this role
		isSysop: () => boolean,
		isAdmin: () => boolean, // ADMIN or higher
		isManager: () => boolean, // MANAGER or higher
		roleLabel: (role: UserRole) => string, // Display label for role
		user,
		isAuthenticated,
	};
}
```

## Consequences

### Positive

- **Clear Hierarchy**: Easy to understand who can do what
- **Type-Safe**: TypeScript catches permission errors at compile time
- **Prevents Escalation**: Clear rules prevent privilege escalation
- **Maintainable**: Centralized permission definitions
- **Organizational Mapping**: Maps well to real-world structures
- **Dual Enforcement**: Backend middleware + frontend hooks
- **Extensible**: Adding new permissions is straightforward
- **Good UX**: Frontend hides unauthorized features

### Negative

- **More Complex**: More complex than simple boolean flags
- **Learning Curve**: Developers must understand hierarchy
- **Permission Design Time**: Need careful planning for new features
- **Role Assignment**: Admin must understand hierarchy when assigning roles

## Security Features

- **Minimum Role Requirement**: Each endpoint requires minimum role level
- **Permission Granularity**: Specific permissions prevent over-privileged actions
- **Self-or-Admin Pattern**: Users can modify themselves without ADMIN role
- **Role Assignment Rules**: SYSOP only can grant ADMIN roles, preventing escalation
- **Audit Logging**: Security-relevant actions logged for auditing

## Related ADRs

- [ADR-002](adr-002-cookie-based-jwt-auth.md): Cookie-based JWT authentication for identity
- [ADR-005](adr-005-json-configuration.md): JSON configuration for role definitions
