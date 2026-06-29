## Feature: Integrated Database Administration Suite (Spernakit v3)

**Objective:** Provide SYSOP and ADMIN-level users with a secure, integrated database management interface within the Spernakit Settings area. Enables schema visualization, data browsing/editing, and ad-hoc read-only queries without requiring external database tools (Drizzle Studio, sqlite3 CLI, etc.).

**Target Stack:** Elysia + Drizzle + bun:sqlite (backend), React 19 + TanStack Query + shadcn/ui (frontend)

---

### 1. Schema Introspection Service (Backend)

- **Service pattern:** Facade + subdirectory (`databaseAdminService.ts` re-exporting from `databaseAdmin/`)
- **Subdirectory files:**
    - `schemaIntrospection.ts` — SQLite PRAGMA-based schema discovery
    - `dataOperations.ts` — Paginated reads, insert, update, delete with old/new value capture
    - `queryExecutor.ts` — Read-only SELECT validation and execution
    - `safeModeManager.ts` — In-memory safe mode state (default: enabled, resets on restart)
- **SQLite introspection via PRAGMAs:**
    - `sqlite_master` — list all user tables (excluding `sqlite_` internals)
    - `PRAGMA table_info({table})` — column metadata (name, type, notnull, default, pk)
    - `PRAGMA foreign_key_list({table})` — FK relationships (target table, source column, target column)
    - `PRAGMA index_list({table})` + `PRAGMA index_info({index})` — index metadata
    - `SELECT COUNT(*) FROM {table}` — row counts (table name validated against allowlist)
- **Typed interfaces:** `TableMetadata`, `ColumnInfo`, `ForeignKeyInfo`, `IndexInfo`, `DataRow`
- **Injection prevention:** Runtime allowlist built from `sqlite_master` results; every function that interpolates a table name validates it against this allowlist first. Drizzle ORM parameterized queries cannot parameterize table names, so this allowlist is the critical defense.

### 2. API Routes (Backend)

- **Route file:** `backend/src/routes/database-admin.ts`
- **Route prefix:** `/database-admin`
- **Registration:** Import `databaseAdminRoutes` in `backend/src/create-api-app.ts`, add `.use(databaseAdminRoutes)` to `routePlugins`

| Method | Path                                     | Guard                       | Description                                        |
| ------ | ---------------------------------------- | --------------------------- | -------------------------------------------------- |
| GET    | `/database-admin/schema`                 | `requireRoleFresh('ADMIN')` | List all tables with column/row counts             |
| GET    | `/database-admin/schema/:tableName`      | `requireRoleFresh('ADMIN')` | Detailed table metadata (columns/FKs/ix)           |
| GET    | `/database-admin/schema/relationships`   | `requireRoleFresh('ADMIN')` | All FK relationships for ERD rendering             |
| GET    | `/database-admin/data/:tableName`        | `requireRoleFresh('ADMIN')` | Paginated table rows (page, limit, includeDeleted) |
| POST   | `/database-admin/data/:tableName`        | `requireRoleFresh('SYSOP')` | Insert new row (safe mode enforced)                |
| PUT    | `/database-admin/data/:tableName/:rowId` | `requireRoleFresh('SYSOP')` | Update row by PK (safe mode enforced)              |
| DELETE | `/database-admin/data/:tableName/:rowId` | `requireRoleFresh('SYSOP')` | Soft/hard delete row (safe mode enforced)          |
| POST   | `/database-admin/query`                  | `requireRoleFresh('ADMIN')` | Execute read-only SELECT query                     |
| GET    | `/database-admin/safe-mode`              | `requireRoleFresh('ADMIN')` | Get current safe mode state                        |
| PUT    | `/database-admin/safe-mode`              | `requireRoleFresh('SYSOP')` | Toggle safe mode                                   |

- **TypeBox validation:** `:tableName` as `t.String({ minLength: 1, pattern: '^[a-z_]+$' })`, `:rowId` as `t.Numeric()`, query body as `t.Object({ sql: t.String({ minLength: 1, maxLength: 4096 }) })`, data body as `t.Record(t.String(), t.Unknown())`
- **Safe mode enforcement:** When enabled, POST/PUT/DELETE on `/data/` return 403 with clear message. SYSOP must explicitly disable safe mode before mutations.
- **Audit integration:** Existing `auditPlugin` auto-captures all mutations. Database admin service adds supplementary audit entries with old/new values for data changes.
- **Handler extraction:** Complex handlers (>30 lines) extracted as named functions per Spernakit convention.

### 3. Schema Explorer (Frontend)

- **New Settings tab:** `{ label: 'Database', to: '/settings/database' }` added to `SettingsLayout.tsx` tabs array (after Backup)
- **Main page:** `frontend/src/pages/settings/DatabaseTab.tsx` — orchestrates sub-panels
- **Sub-components in `frontend/src/pages/settings/database/`:**
    - `SchemaExplorerPanel.tsx` — Searchable/filterable table list using shadcn/ui Card, Input, Badge. Click table → column details panel showing name, type, nullable, default, PK, FK references.
    - `ErdPanel.tsx` — Interactive SVG-based ERD. Table nodes (rectangles with table name header + column list). FK relationship lines with directional arrows. Click table node → navigate to that table's data view.
- **API module:** `frontend/src/api/databaseAdmin.ts` with typed functions for all endpoints, using `apiClient`
- **API types:** Independently defined in `frontend/src/api/types.ts` (no backend imports): `TableMetadata`, `ColumnInfo`, `ForeignKeyInfo`, `IndexInfo`, `SafeModeState`, `QueryResult`
- **TanStack Query keys:** `['database-admin', 'schema']`, `['database-admin', 'table', tableName]`, `['database-admin', 'data', tableName, page]`
- **Role-gating:** `useAuthorization()` hook — `isAdmin()` to view tab, `isSysop()` for mutation controls
- **Lazy loading:** `React.lazy()` with `.then((m) => ({ default: m.DatabaseTab }))` pattern in `routes.tsx`
- **Route:** `{ path: 'database', element: <LazyPage Component={DatabaseTab} /> }` under `/settings` children

### 4. Data Viewer (Frontend)

- **Component:** `frontend/src/pages/settings/database/DataViewerPanel.tsx`
- **Data grid:** Uses existing `DataTable` component (`frontend/src/components/shared/DataTable.tsx`) with server-side pagination
- **Inline editing:** Click cell → edit mode with type-aware inputs:
    - TEXT columns → text input
    - INTEGER/REAL columns → number input
    - DATETIME/timestamp columns → date picker
    - BOOLEAN/integer 0/1 → checkbox
- **Soft-delete toggle:** Switch component controls `includeDeleted` query parameter
- **Safe mode indicator:** Badge showing current state; toggle Button visible only to SYSOP via `isSysop()`
- **CRUD operations:**
    - Create: Dialog with dynamic form based on column metadata, non-nullable columns required
    - Edit: Inline cell editing with save on blur/enter
    - Delete: AlertDialog confirmation distinguishing soft-delete (tables with `isDeleted` column) from hard-delete
- **Mutation gating:** Create/edit/delete controls rendered only when `isSysop()` returns true AND safe mode is disabled
- **Feedback:** sonner toasts via `toast.success()` / `toast.error()` on all mutations
- **Export:** CSV and JSON download buttons for current page or full dataset (client-side from fetched data)

### 5. SQL Sandbox (Frontend)

- **Component:** `frontend/src/pages/settings/database/SqlSandboxPanel.tsx`
- **Query editor:** Textarea with `font-mono` class, placeholder showing example SELECT, maxLength 4096
- **Execution:** Execute button → POST `/database-admin/query` via `useMutation`. Disabled while pending, shows loading indicator.
- **Validation:** Server-side only — no client-side SQL parsing. Backend rejects non-SELECT, multi-statement, and DDL/DML.
- **Results:** DataTable with dynamically generated columns from result keys. Row count summary line.
- **Errors:** Inline error display below textarea using `text-destructive` styling
- **Export:** CSV and JSON download of result set when results are available
- **No persistence:** Query history is session-only via React state

### 6. Security Model

- **RBAC enforcement:**
    - ADMIN (tier 4)+ can view all schema and data (read-only endpoints)
    - SYSOP (tier 5) required for any mutations and safe mode toggle
    - All guards use `requireRoleFresh()` (re-queries DB, prevents stale-role escalation)
- **Safe mode:** Enabled by default on server start. SYSOP must explicitly disable to perform mutations. Resets to enabled on server restart (safe default).
- **SQL injection prevention:**
    - Table names validated against `sqlite_master` allowlist before interpolation
    - Data queries use Drizzle ORM parameterized queries
    - SQL sandbox validates single SELECT statement (no semicolons, blocks PRAGMA/INSERT/UPDATE/DELETE/DROP/ALTER/CREATE)
- **Audit trail:** Existing `auditPlugin` captures all mutation HTTP methods. Service-level supplementary audit for old/new value diffs on data changes.

### 7. Integration Points

| Target File                                      | Change                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `backend/src/create-api-app.ts`                  | Import + `.use(databaseAdminRoutes)` in `routePlugins`                                           |
| `frontend/src/pages/settings/SettingsLayout.tsx` | Add `{ label: 'Database', to: '/settings/database' }` to tabs                                    |
| `frontend/src/routes.tsx`                        | Lazy import `DatabaseTab`, add route under `/settings` children                                  |
| `frontend/src/api/types.ts`                      | Add `TableMetadata`, `ColumnInfo`, `ForeignKeyInfo`, `IndexInfo`, `SafeModeState`, `QueryResult` |

**No new database tables.** This feature introspects the existing database schema; it does not create new tables. Safe mode state is in-memory only.

### 8. Architecture Decisions

1. **Facade + subdirectory** for the service follows the established pattern used by `userService.ts`, `workspaceService.ts`, etc.
2. **Plain SVG for ERD** avoids heavyweight dependencies (d3, reactflow) for what is fundamentally rectangles with connecting lines.
3. **SQL sandbox is intentionally limited** — read-only SELECT only, server-validated, no multi-statement. Minimizes attack surface while providing utility.
4. **Export is client-side** — CSV/JSON generated in the browser from already-fetched data. No dedicated backend export endpoints.
5. **Safe mode resets on restart** — in-memory state means the safest default (enabled) is always restored.
