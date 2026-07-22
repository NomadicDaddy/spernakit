# Role-Based Access Control (RBAC)

How the RBAC system works in spernakit.

## Table of Contents

1. [Overview](#overview)
2. [Role Hierarchy](#role-hierarchy)
3. [Permission Matrix](#permission-matrix)
4. [Implementation](#implementation)
5. [Frontend Protection](#frontend-protection)
6. [Backend Protection](#backend-protection)
7. [Workspace-Level RBAC](#workspace-level-rbac)
8. [Data Authority](#data-authority)
9. [Security Specifications](#security-specifications)
10. [Customization](#customization)
11. [Testing RBAC](#testing-rbac)

---

## Overview

The template uses a five-tier role-based access control system. Each role has its own set of permissions.

### Key Features

- **Hierarchical roles**: Higher roles inherit permissions from lower roles
- **Route protection**: On both frontend and backend
- **Component-level checks**: Conditional rendering based on roles
- **Fresh role validation**: Sensitive operations re-validate the role from the database, not the JWT
- **Audit trail**: All role-based actions are logged
- **Workspace isolation**: Two-tier RBAC with global and workspace-level roles
- **Configurable labels**: Per-application role display names via config schema
- **Shared types**: Role types and hierarchy in the `spernakit-shared` package

---

## Role Hierarchy

### SYSOP (System Operator)

**Highest Level (5) - System Administration**

- Complete system access
- Cross-workspace visibility - bypasses workspace isolation
- User management (all roles)
- System configuration
- Database management
- Audit log access
- Security settings

**Use Cases:**

- System administrators
- DevOps personnel
- IT security teams

### ADMIN (Administrator)

**Level 4 - Application Administration**

- Application management
- User management (MANAGER, OPERATOR, VIEWER only - strict inequality)
- Business configuration
- Reports and analytics
- Content management
- Workspace management
- Broadcast notifications

**Use Cases:**

- Application administrators
- Business managers
- Department heads

### MANAGER (Manager)

**Level 3 - Team and User Management**

- Workspace member management
- Assign roles within workspace
- Full data operations access
- Advanced reporting and analytics
- User data export capabilities

**Use Cases:**

- Team leaders
- Project managers
- Department supervisors
- Regional managers

### OPERATOR (Operator)

**Level 2 - Standard Operations**

- Daily operations
- Data entry and editing
- Standard reporting
- File uploads
- View system health details
- View settings

**Use Cases:**

- Regular employees
- Data entry personnel
- Customer service

### VIEWER (Viewer)

**Level 1 - Read-Only Access**

- View-only permissions
- Dashboard access
- View own notifications
- Update own profile
- Read workspace data

**Use Cases:**

- Stakeholders
- Auditors
- Temporary access users

---

## Limited Access Definitions

The RBAC system uses different access levels to control permissions. Here is what "Limited" access means in each case:

### User Management (Limited)

All user management endpoints (`/api/v1/users` list/create/read/update/delete) are gated by `requireRoleFresh('ADMIN')` - only ADMIN and SYSOP can reach them. MANAGER, OPERATOR, and VIEWER have no access to other users' records; they can only view and update their own profile.

**ADMIN Limited User Creation:**

- Can Create: MANAGER, OPERATOR and VIEWER users only
- Cannot Create: ADMIN or SYSOP users
- Can Edit: MANAGER, OPERATOR and VIEWER users only
- Cannot Edit: ADMIN or SYSOP users

### Role Management Rules (Single Source of Truth)

The definitive role management rules are implemented in the `canModifyRole()` function in `backend/src/guards/role.ts`. The rule is **strict inequality**: a user can only modify users with a role level strictly lower than their own.

```typescript
// canModifyRole() - requesterLevel must be strictly greater than targetLevel
function canModifyRole(requesterRole: UserRole, targetRole: UserRole): boolean {
	const requesterLevel = ROLE_HIERARCHY[requesterRole] ?? 0;
	const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;
	return requesterLevel > targetLevel;
}
```

Effective permissions:

| Requester Role | Can Manage                       |
| -------------- | -------------------------------- |
| SYSOP (5)      | ADMIN, MANAGER, OPERATOR, VIEWER |
| ADMIN (4)      | MANAGER, OPERATOR, VIEWER        |
| MANAGER (3)    | OPERATOR, VIEWER                 |
| OPERATOR (2)   | VIEWER                           |
| VIEWER (1)     | (none)                           |

Note: `canModifyRole()` is the role-comparison rule only. Route-level access to user management additionally requires `requireRoleFresh('ADMIN')`, so in practice the MANAGER/OPERATOR rows never come into play for user CRUD.

### Audit & Security (Limited)

**ADMIN Audit Access:**

- Audit log reads require `requireRoleFresh('ADMIN')` - ADMIN and SYSOP only
- Scoped to the active workspace via the `X-Workspace-Id` header; SYSOP sees all workspaces
- History is bounded only by the retention policy (`retention.auditLogsDays`, default 90 days) - there is no per-role time cap

### Planned / Not Yet Implemented

The following restrictions are design intentions that are **not** enforced by the current implementation:

- ADMIN audit access capped to the last 30 days, or filtered to exclude SYSOP user activities
- Per-role API rate limits (rate limiting is global per-IP via the `rateLimit` config section, plus a stricter auth-endpoint limiter)
- Data export quotas (per-day export limits, per-export record caps, or field-level export filtering for OPERATOR)

### Reporting (Limited)

**OPERATOR/VIEWER Limited Reporting:**

- Can Access: Standard reports (user counts, role distribution, basic metrics)
- Cannot Access: Advanced analytics, detailed audit reports, performance metrics
- Data Scope: Aggregated data only (no individual user details)
- Time Range: Last 7 days for OPERATOR, last 3 days for VIEWER

---

## Permission Matrix

| Resource             | Permission | SYSOP | ADMIN   | MANAGER | OPERATOR | VIEWER  |
| -------------------- | ---------- | ----- | ------- | ------- | -------- | ------- |
| **User Management**  |            |       |         |         |          |         |
|                      | Create     | Full  | Limited | -       | -        | -       |
|                      | Read       | Full  | Full    | -       | -        | -       |
|                      | Update     | Full  | Limited | -       | -        | -       |
|                      | Delete     | Full  | Limited | -       | -        | -       |
| **System Settings**  |            |       |         |         |          |         |
|                      | Read       | Full  | Full    | Limited | -        | -       |
|                      | Update     | Full  | Full    | -       | -        | -       |
| **Audit & Security** |            |       |         |         |          |         |
|                      | Read       | Full  | Limited | -       | -        | -       |
| **Data Operations**  |            |       |         |         |          |         |
|                      | Create     | Full  | Full    | Full    | Full     | -       |
|                      | Read       | Full  | Full    | Full    | Full     | Read    |
|                      | Update     | Full  | Full    | Full    | Own      | -       |
|                      | Delete     | Full  | Full    | Full    | Own      | -       |
| **Data Export**      |            |       |         |         |          |         |
|                      | Read       | Full  | Full    | Full    | Limited  | -       |
| **Reporting**        |            |       |         |         |          |         |
|                      | Read       | Full  | Full    | Full    | Limited  | Limited |

---

## Implementation

### Role Types and Hierarchy (Shared Package)

Role types and hierarchy live in the `spernakit-shared` package, consumed by both backend and frontend:

```typescript
// shared/src/roles.ts
type UserRole = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'SYSOP' | 'VIEWER';

const ROLE_HIERARCHY: Record<UserRole, number> = {
	ADMIN: 4,
	MANAGER: 3,
	OPERATOR: 2,
	SYSOP: 5,
	VIEWER: 1,
};

const ROLES: UserRole[] = ['SYSOP', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'];

function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
	return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
```

Backend re-exports from the shared package:

```typescript
// backend/src/types/roles.ts
export { hasMinimumRole, ROLE_HIERARCHY, ROLES, validateUserRole } from 'spernakit-shared';
export type { UserRole } from 'spernakit-shared';
```

Frontend re-exports from the shared package:

```typescript
// frontend/src/types/roles.ts
export { hasMinimumRole, ROLES } from 'spernakit-shared';
export type { UserRole } from 'spernakit-shared';
```

### Configurable Role Labels

Role display names and descriptions are configurable per-application via the config schema:

```typescript
// backend/src/config/configSchemas/roles.ts
import { Type, withDefault } from '../configSchemaHelpers';

export const rolesSchema = Type.Object({
	ADMIN: withDefault(roleDisplaySchema, {
		description: 'Application administration, user management',
		label: 'Administrator',
	}),
	SYSOP: withDefault(roleDisplaySchema, {
		description: 'System administration, cross-workspace access',
		label: 'System Operator',
	}),
	// ... etc for MANAGER, OPERATOR, VIEWER
});
```

These labels are exposed to the frontend via `user.roleLabels` and used in `useAuthorization().roleLabel()`.

### Database Schema

```typescript
// backend/src/db/schema/users.ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull().unique(),
	email: text('email').notNull().unique(),
	role: text('role').notNull().default('VIEWER'), // SYSOP, ADMIN, MANAGER, OPERATOR, VIEWER
	isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
	// ... other fields
});
```

---

## Frontend Protection

### Route Protection

```typescript
// frontend/src/components/auth/ProtectedRoute.tsx
interface ProtectedRouteProps {
	requiredRole?: UserRole;
}

function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
	const { hasMinRole, isAuthenticated } = useAuthorization();

	// Verifies session with server, checks role if specified
	if (requiredRole && !hasMinRole(requiredRole)) {
		return <Navigate replace to="/dashboard" />;
	}

	return <Outlet />;
}
```

### Usage in Routes

```typescript
// frontend/src/routes.tsx
{
	element: <ProtectedRoute requiredRole="ADMIN" />,
	path: '/settings',
	children: [
		// ... settings sub-routes
		{
			element: <ProtectedRoute requiredRole="SYSOP" />,
			path: 'authentication',
			children: [{ index: true, lazy: () => import('./pages/settings/auth/AuthenticationTab') }],
		},
	],
}
```

### Component-Level Protection

The `useAuthorization` hook provides role-checking utilities for conditional rendering:

```typescript
// frontend/src/hooks/useAuthorization.ts
function useAuthorization() {
	return {
		hasMinRole, // (role: UserRole) => boolean - hierarchy check
		hasRole, // (role: UserRole) => boolean - exact match
		can, // alias for hasMinRole
		isSysop, // () => boolean
		isAdmin, // () => boolean
		isManager, // () => boolean
		roleLabel, // (role: UserRole) => string - config-aware label
		user,
		isAuthenticated,
	};
}
```

Usage in components:

```typescript
function MyComponent() {
	const { hasMinRole, isSysop } = useAuthorization();

	return (
		<div className="flex gap-2">
			<Button variant="outline">View</Button>

			{hasMinRole('OPERATOR') && <Button variant="secondary">Edit</Button>}

			{hasMinRole('MANAGER') && <Button variant="default">Manage</Button>}

			{hasMinRole('ADMIN') && <Button variant="destructive">Delete</Button>}
		</div>
	);
}
```

### Navigation Menu

Navigation visibility is controlled via `hasMinRole` passed to `getVisibleNavItems()`:

```typescript
// frontend/src/components/layout/Sidebar.tsx
const { hasMinRole } = useAuthorization();
const visibleNavItems = getVisibleNavItems(hasMinRole, appFeatures);
```

---

## Backend Protection

### Guards

The backend uses guard functions in `backend/src/guards/role.ts`:

```typescript
// requireAuth - checks JWT or API key authentication
function requireAuth(ctx: GuardContext): ErrorResponse | undefined;

// requireRoleFresh - re-validates role from database (not JWT)
// Use for sensitive operations where stale JWT claims could allow unauthorized access
function requireRoleFresh(minimumRole: UserRole): (ctx: GuardContext) => ErrorResponse | undefined;

// assertUser - type-safe narrowing for guarded routes
function assertUser(user: AuthPayload | null): AuthPayload;

// canModifyRole - strict inequality check for user CRUD
function canModifyRole(requesterRole: UserRole, targetRole: UserRole): boolean;

// isSysop - check if user has SYSOP level
function isSysop(user: AuthPayload | null): boolean;
```

### Route Protection

```typescript
// backend/src/routes/example.ts
import { Elysia } from 'elysia';
import { assertUser, requireRoleFresh } from '../../guards/role.ts';

export const exampleRoutes = new Elysia({ prefix: '/example' })
	// OPERATOR and above can view
	.get('/', ({ set, user }) => {
		const guard = requireRoleFresh('OPERATOR')({ set, user });
		if (guard) return guard;
		const authedUser = assertUser(user);
		return getData(authedUser);
	})

	// ADMIN and above can manage
	.post('/', ({ set, user, body }) => {
		const guard = requireRoleFresh('ADMIN')({ set, user });
		if (guard) return guard;
		const authedUser = assertUser(user);
		return createData(body, authedUser);
	});
```

### Using beforeHandle

For routes using Elysia's `beforeHandle` hook pattern:

```typescript
.get('/admin-data', handler, {
	beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
})
```

---

## Workspace-Level RBAC

Spernakit uses a **two-tier RBAC system**: global roles for application-wide access, and workspace-level roles for access within individual workspaces.

### Workspace Role Hierarchy

Workspace roles use a **1-4 numeric scale** (same values as global roles, excluding SYSOP):

| Role       | Level | Description                                  |
| ---------- | ----- | -------------------------------------------- |
| `VIEWER`   | 1     | Read-only access to workspace resources      |
| `OPERATOR` | 2     | Standard operations, data entry/modification |
| `MANAGER`  | 3     | Team and workspace member management         |
| `ADMIN`    | 4     | Full workspace administration                |

Authorization checks use numeric comparison: `userLevel >= requiredLevel`.

### Global Role Bypass Rules

Global roles interact with workspace-level checks as follows:

| Global Role  | Workspace Membership Bypass | Workspace Role Bypass | Notes                                                                                 |
| ------------ | --------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| VIEWER (1)   | No                          | No                    | Must be workspace member with sufficient role                                         |
| OPERATOR (2) | No                          | No                    | Must be workspace member with sufficient role                                         |
| MANAGER (3)  | No                          | No                    | Must be workspace member with sufficient role                                         |
| ADMIN (4)    | No                          | No                    | Must be workspace member with sufficient role (does NOT bypass workspace role checks) |
| SYSOP (5)    | **Yes**                     | **Yes**               | Bypasses all workspace checks entirely                                                |

### Workspace Access Guards

Two guard functions in `backend/src/guards/workspaceAccess.ts` enforce workspace-level authorization:

**`requireWorkspaceAccess()`** - Checks the authenticated user is a member of the workspace specified in the `X-Workspace-ID` header. SYSOP users bypass this check entirely.

**`requireWorkspaceRole(ctx, minimumRole)`** - Checks the user's workspace-level role meets a minimum threshold (e.g., `ADMIN`, `MANAGER`). Only global SYSOP users bypass this check. Non-bypassed users must have a `workspace_members` record with a role at or above the required level.

### Workspace Context

The workspace ID is passed via the **`X-Workspace-ID` request header** from the frontend. The frontend reads the active workspace from the Zustand `workspaceStore` and includes it automatically in all API requests via `getCommonHeaders()`.

### Implementation Files

| Component              | File Path                                         |
| ---------------------- | ------------------------------------------------- |
| Workspace guards       | `backend/src/guards/workspaceAccess.ts`           |
| Global role hierarchy  | `shared/src/roles.ts`                             |
| Backend role re-export | `backend/src/types/roles.ts`                      |
| Role guard functions   | `backend/src/guards/role.ts`                      |
| Workspace routes       | `backend/src/routes/workspaces/crud.ts`           |
| Workspace members      | `backend/src/routes/workspaces/members-crud.ts`   |
| Bulk member ops        | `backend/src/routes/workspaces/members-bulk.ts`   |
| Frontend auth hook     | `frontend/src/hooks/useAuthorization.ts`          |
| Frontend route guard   | `frontend/src/components/auth/ProtectedRoute.tsx` |
| Frontend role types    | `frontend/src/types/roles.ts`                     |
| Frontend header setup  | `frontend/src/api/requestHelpers.ts`              |
| Workspace store        | `frontend/src/stores/workspaceStore.ts`           |
| Role config schema     | `backend/src/config/configSchemas/roles.ts`       |

---

## Data Authority

### Authority Hierarchy

Spernakit uses a three-tier data authority model:

| Level           | Description                                | Examples                                  |
| --------------- | ------------------------------------------ | ----------------------------------------- |
| **Environment** | Build/startup config, immutable at runtime | App identity, security keys, database URL |
| **Database**    | Persistent app data via services           | Users, roles, audit logs                  |
| **User**        | Client-side transient state                | Form data, UI state, cache                |

### Configuration Authority

| Category           | Authority   | Storage             | Runtime Write |
| ------------------ | ----------- | ------------------- | ------------- |
| App/Server config  | Environment | `config/{app}.json` | No            |
| Security keys      | Environment | `config/{app}.json` | No            |
| User preferences   | Database    | Database table      | Yes           |
| Notification prefs | Database    | Database table      | Yes           |

**Rules:**

- System configuration is **read-only at runtime** (requires server restart)
- Only `user` and `notifications` categories are writable via `/api/settings`
- Security-related configs blocked with 400 Bad Request

### Data Access by Role

| Resource         | SYSOP | ADMIN | MANAGER | OPERATOR | VIEWER |
| ---------------- | ----- | ----- | ------- | -------- | ------ |
| User management  | Full  | Full  | Self    | Self     | Self   |
| System config    | Read  | Read  | -       | -        | -      |
| Audit logs       | Full  | Full  | -       | -        | -      |
| Notifications    | Full  | Full  | Full    | Own      | Own    |
| User preferences | Full  | Full  | Full    | Own      | Own    |

---

## Security Specifications

### Session Management

**Role Change Behavior:**

- Immediate Effect: Role changes take effect on next API request
- Session Persistence: User sessions remain active during role changes
- Security Note: Users must sign out and sign in again to see navigation changes
- Token Validation: JWT tokens include role information; `requireRoleFresh` re-validates from DB for sensitive operations

**Session Timeout:**

- JWT Expiration: Tokens expire after 24 hours by default
- Token Refresh: No automatic refresh - users must authenticate again
- Concurrent Sessions: Multiple active sessions supported per user

### Audit Trail Specifications

**Logging Granularity by Role:**

**SYSOP Actions (Internal Only):**

- All system-level operations
- User role assignments and changes
- System configuration changes
- Security setting modifications

**ADMIN Actions:**

- User creation, modification, deletion (MANAGER/OPERATOR/VIEWER only)
- Application settings changes
- Data export operations
- Failed permission attempts

**OPERATOR Actions:**

- Data record creation, modification, deletion
- Limited data export operations
- Profile updates (own profile only)

**VIEWER Actions:**

- Data record access (read-only)
- Report generation (standard reports only)

### Data Retention Policies

**Audit Log Retention:**

- SYSOP Logs: Retained indefinitely (system requirement)
- ADMIN Logs: Retained for 1 year
- OPERATOR Logs: Retained for 6 months
- VIEWER Logs: Retained for 3 months
- Security Events: Retained for 2 years regardless of role

**User Data Retention:**

- Active Users: No automatic deletion
- Inactive Users: Flagged after 90 days of inactivity
- Deleted Users: Soft delete with 30-day recovery period

### API Rate Limiting

Rate limiting is **global per-IP, not per-role**:

- General limiter: `rateLimit.maxRequests` per `rateLimit.windowMs` (default 600 requests / 15 minutes), configured in the `rateLimit` config section
- Auth endpoints: a stricter dedicated limiter, toggleable via auth security settings (`rateLimit.authEnabled` plus the admin-editable `authRateLimitEnabled` setting)
- Failed logins: account lockout after repeated failures (see [SECURITY.md](SECURITY.md))

### Permission Validation

**Validation Layers:**

1. **Frontend**: Navigation and UI element visibility via `useAuthorization`
2. **Route Protection**: Page-level access control via `ProtectedRoute`
3. **API Guards**: Endpoint-level authorization via `requireRoleFresh`
4. **Service Layer**: Business logic permission checks via `canModifyRole`
5. **Database**: Row-level security (where applicable)

**Validation Frequency:**

- Every API Request: Role and permissions validated
- Navigation Render: Permissions checked on component mount
- Real-time Updates: No automatic permission refresh (requires page reload)

---

## Best Practices

### Security Guidelines

1. **Principle of Least Privilege**: Assign minimum required permissions
2. **Regular Audits**: Review role assignments periodically
3. **Audit Logging**: Log all role-based actions
4. **Input Validation**: Validate role assignments server-side
5. **Session Management**: Invalidate sessions on role changes

### Development Guidelines

1. **Shared Types**: Use `spernakit-shared` for role types - never redefine
2. **Fresh Validation**: Use `requireRoleFresh` for sensitive operations, not JWT-only checks
3. **Strict Inequality**: Role modification requires strictly higher level (`canModifyRole`)
4. **useAuthorization**: Use the hook for all frontend role checks - never read role directly
5. **Config Labels**: Use `roleLabels` for display names - never hardcode role names in UI text
6. **Testing**: Test all role combinations thoroughly

---

## Testing RBAC

### Test Cases

> **Note:** Test suites have been archived. The following code block is an example illustrating expected RBAC behavior, not a reference to a live test file.

```typescript
// Example: RBAC test cases
import { describe, expect, test } from 'bun:test';
import { hasMinimumRole, ROLE_HIERARCHY } from 'spernakit-shared';

describe('RBAC System', () => {
	test('ADMIN can access MANAGER, OPERATOR and VIEWER endpoints', () => {
		expect(hasMinimumRole('ADMIN', 'VIEWER')).toBe(true);
		expect(hasMinimumRole('ADMIN', 'OPERATOR')).toBe(true);
		expect(hasMinimumRole('ADMIN', 'MANAGER')).toBe(true);
		expect(hasMinimumRole('ADMIN', 'ADMIN')).toBe(true);
	});

	test('MANAGER can access OPERATOR and VIEWER endpoints but not ADMIN', () => {
		expect(hasMinimumRole('MANAGER', 'VIEWER')).toBe(true);
		expect(hasMinimumRole('MANAGER', 'OPERATOR')).toBe(true);
		expect(hasMinimumRole('MANAGER', 'MANAGER')).toBe(true);
		expect(hasMinimumRole('MANAGER', 'ADMIN')).toBe(false);
	});

	test('OPERATOR can access VIEWER endpoints but not MANAGER or ADMIN', () => {
		expect(hasMinimumRole('OPERATOR', 'VIEWER')).toBe(true);
		expect(hasMinimumRole('OPERATOR', 'OPERATOR')).toBe(true);
		expect(hasMinimumRole('OPERATOR', 'MANAGER')).toBe(false);
		expect(hasMinimumRole('OPERATOR', 'ADMIN')).toBe(false);
	});

	test('VIEWER cannot access higher role endpoints', () => {
		expect(hasMinimumRole('VIEWER', 'VIEWER')).toBe(true);
		expect(hasMinimumRole('VIEWER', 'OPERATOR')).toBe(false);
		expect(hasMinimumRole('VIEWER', 'MANAGER')).toBe(false);
		expect(hasMinimumRole('VIEWER', 'ADMIN')).toBe(false);
	});

	test('Role hierarchy numeric ordering is correct', () => {
		expect(ROLE_HIERARCHY.SYSOP > ROLE_HIERARCHY.ADMIN).toBe(true);
		expect(ROLE_HIERARCHY.ADMIN > ROLE_HIERARCHY.MANAGER).toBe(true);
		expect(ROLE_HIERARCHY.MANAGER > ROLE_HIERARCHY.OPERATOR).toBe(true);
		expect(ROLE_HIERARCHY.OPERATOR > ROLE_HIERARCHY.VIEWER).toBe(true);
	});
});
```

---

## Customization

### Adding New Roles

1. **Update Shared Package** (`shared/src/roles.ts`)

    ```typescript
    type UserRole = 'ADMIN' | 'MANAGER' | 'NEW_ROLE' | 'OPERATOR' | 'SYSOP' | 'VIEWER';

    const ROLE_HIERARCHY: Record<UserRole, number> = {
    	ADMIN: 4,
    	MANAGER: 3,
    	NEW_ROLE: 2.5, // Assign hierarchy level
    	OPERATOR: 2,
    	SYSOP: 5,
    	VIEWER: 1,
    };

    const ROLES: UserRole[] = ['SYSOP', 'ADMIN', 'MANAGER', 'NEW_ROLE', 'OPERATOR', 'VIEWER'];
    ```

2. **Update Config Schema** (`backend/src/config/configSchemas/roles.ts`)

    ```typescript
    export const rolesSchema = z.object({
    	// ... existing roles
    	NEW_ROLE: roleDisplaySchema.default({
    		description: 'Description of the new role',
    		label: 'New Role',
    	}),
    });
    ```

3. **Update RolesTab** (`frontend/src/pages/settings/roles/RolesTab.tsx`)

    Add a new entry to the `ROLE_DEFINITIONS` array with icon, permissions, variant, etc.

4. **Update Guards** - `canModifyRole` and `requireRoleFresh` automatically work via `ROLE_HIERARCHY` numeric comparison. No code changes needed unless the new role has special bypass rules.

---

Need help with RBAC? Check the implementation examples above or open an issue in the repository.
