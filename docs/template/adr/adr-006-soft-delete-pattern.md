# ADR-006: Soft Delete Pattern Implementation

## Status

Accepted

## Context

Enterprise applications need data deletion that:

- Allows recovery from accidental deletions
- Maintains data integrity and referential integrity
- Supports audit trails and historical analysis
- Provides good user experience (undo operations)
- Complies with data retention requirements
- Prevents permanent data loss from human error

We needed a deletion strategy that balances:

- **User experience**: Easy to "delete" items
- **Data recovery**: Ability to restore deleted items
- **Audit compliance**: Keep records of deleted data
- **Performance**: Don't slow down queries with deleted data
- **Storage**: Manage database growth over time

## Decision Drivers

- **Recoverability**: Accidental deletions should be recoverable
- **Audit trail**: Deletions should be logged with who, when, why
- **Referential integrity**: Foreign keys should still work
- **User experience**: "Delete" should feel instantaneous
- **Performance**: Queries should not be significantly slower
- **Storage management**: Deleted data shouldn't grow indefinitely

## Considered Alternatives

### Alternative 1: Hard Delete (Permanently Remove from Database)

Pros:

- Simple to implement (`DELETE FROM table WHERE id = ?`)
- No performance overhead from checking deleted flag
- Database automatically reclaims space
- No storage concerns

Cons:

- **Irrecoverable**: Data lost forever, can't undo
- **Poor user experience**: One mistake causes permanent loss
- **No audit trail**: Can't track what was deleted
- **Cascading deletes**: Complex relationships lost
- **Compliance issues**: Some regulations require data retention
- **User support**: Increased support tickets for data loss
- **Bad for business**: Lost customers, lost revenue, lost data

### Alternative 2: Archive Before Delete (Copy to Archive Table)

Pros:

- Deleted data recoverable
- Separates active from archive data
- Can purge archives after retention period

Cons:

- **Complex implementation**: Need to copy before delete (transactions)
- **More database tables**: Duplicate schema for each entity (users_archive, etc.)
- **Cascading complexity**: Must archive all related records
- **Slower deletes**: Insert into archive table + delete from main table
- **Schema drift**: Archive tables must stay in sync with main tables
- **Higher storage**: Duplicate data (original + archived)
- **Maintenance overhead**: Need to manage archive table structure changes

### Alternative 3: Versioning System (Track All Changes)

Pros:

- Complete history of all changes
- Can restore any previous version
- Perfect for audit requirements
- Comprehensive audit trail

Cons:

- **Very complex**: Need to track INSERT, UPDATE, DELETE for all entities
- **Large database**: Every change creates new record
- **Slow queries**: Must query version history
- **Overkill for most use cases**: Rarely need to restore arbitrary old versions
- **Complex UI**: Need to show version history, restore options
- **Performance impact**: Every update inserts new version record
- **Storage explosion**: Database grows 10-100x faster

### Alternative 4: Soft Delete with Fields (Selected)

Pros:

- **Simple implementation**: Add 3 fields to each model
- **Recoverable**: Can restore deleted records
- **Audit trail**: Tracks who deleted, when deleted
- **Referential integrity**: Foreign keys still work (records not physically deleted)
- **Fast delete**: Just UPDATE statement (no transaction needed)
- **No schema duplication**: Single table per entity
- **Good performance**: Query filters handle deleted records
- **User experience**: "Delete" feels instant, can add "Undo" feature
- **Clear semantics**: isDeleted, deletedAt, deletedBy are self-documenting

Cons:

- **Query complexity**: Must add `WHERE isDeleted = false` to all queries
- **Storage growth**: Deleted records remain in database
- **Database bloat**: Deleted records must be periodically purged
- **Index overhead**: Additional indexes on deleted fields
- **Confusion**: Developers must remember to filter deleted records
- **Foreign key confusion**: Related records may be deleted but parent not

## Decision Outcome

Chosen alternative: Soft delete pattern with timestamp and audit fields

**Why this alternative was chosen:**

1. **Simple Implementation**: Just 3 fields added to core entity tables:

    ```typescript
    // In Drizzle schema
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    deletedBy: integer('deleted_by'),
    ```

2. **Recoverability**: Deleted records can be restored:

    ```typescript
    db.update(users)
    	.set({ isDeleted: false, deletedAt: null, deletedBy: null })
    	.where(eq(users.id, id))
    	.run();
    ```

3. **Audit Trail**: Automatically tracks deletion metadata:
    - `deletedAt`: When was it deleted?
    - `deletedBy`: Who deleted it? (user ID)
    - Combined with AuditLog table, provides complete audit trail

4. **Referential Integrity**: Records not physically deleted, so foreign keys still work. No cascading delete complexity.

5. **Fast Deletes**: Soft delete is just an UPDATE:

    ```typescript
    // Soft delete (instant)
    db.update(users)
    	.set({ isDeleted: true, deletedAt: new Date(), deletedBy: currentUserId })
    	.where(eq(users.id, id))
    	.run();

    // Hard delete (requires manual cascade)
    db.delete(notifications).where(eq(notifications.userId, id)).run();
    db.delete(auditLogs).where(eq(auditLogs.userId, id)).run();
    db.delete(users).where(eq(users.id, id)).run();
    ```

6. **Consistent Pattern**: Core entities (users, workspaces, workspace members) follow the same soft delete pattern. Ephemeral and security tables (token blacklist, password history, notifications, API key nonces) use hard delete since recoverability is not needed.

7. **Easy to Add to Existing Models**: Migration just adds 3 fields. No schema restructuring.

8. **Supports "Undo" Feature**: Can add UI to restore recently deleted items:
    - "Undo delete" button on notifications
    - "Restore user" in user management
    - "Recover data" for bulk operations

9. **Query Pattern**: Use Drizzle's `where` to filter deleted records:

    ```typescript
    // Exclude deleted records
    const activeUsers = db.select().from(users).where(eq(users.isDeleted, false)).all();

    // Include deleted records (admin view)
    const allUsers = db.select().from(users).all();
    ```

10. **Storage Management**: Can implement cleanup jobs to permanently delete old records after retention period (90 days, 365 days, etc.)

## Implementation Details

### Drizzle Schema

```typescript
// backend/src/db/schema/users.ts
const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull().unique(),
	// ... other fields ...

	// Soft delete fields
	isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
	deletedAt: integer('deleted_at', { mode: 'timestamp' }),
	deletedBy: integer('deleted_by'),
});
```

### Soft Delete Service

```typescript
function softDeleteUser(userId: number, deletedBy: number) {
	const db = getDb();
	return db
		.update(users)
		.set({ isDeleted: true, deletedAt: new Date(), deletedBy })
		.where(eq(users.id, userId))
		.run();
}

function restoreUser(userId: number) {
	const db = getDb();
	return db
		.update(users)
		.set({ isDeleted: false, deletedAt: null, deletedBy: null })
		.where(eq(users.id, userId))
		.run();
}

function permanentDeleteUser(userId: number) {
	const db = getDb();
	return db.delete(users).where(eq(users.id, userId)).run();
}
```

### Query Filtering

```typescript
const db = getDb();

// Default: exclude deleted records
const activeUsers = db.select().from(users).where(eq(users.isDeleted, false)).all();

// Admin view: include all records
const allUsers = db.select().from(users).all();

// Count active records only
const activeCount = db
	.select({ count: count() })
	.from(users)
	.where(eq(users.isDeleted, false))
	.get();
```

### Audit Logging

```typescript
function deleteUser(userId: number, deletedByUserId: number) {
	const db = getDb();

	// 1. Log audit entry
	db.insert(auditLogs)
		.values({
			action: 'USER_DELETED',
			details: JSON.stringify({ deletedUserId: userId }),
			resource: 'user',
			resourceId: String(userId),
			userId: deletedByUserId,
		})
		.run();

	// 2. Soft delete user
	softDeleteUser(userId, deletedByUserId);
}
```

## Storage Management

Soft deletes will eventually cause database growth. Implement retention policy:

### Options for Storage Cleanup

1. **Time-based cleanup**: Permanently delete records older than X days (90, 365)

    ```typescript
    // Run monthly cleanup job
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    db.delete(users)
    	.where(and(eq(users.isDeleted, true), lt(users.deletedAt, cutoff)))
    	.run();
    ```

2. **Manual cleanup**: Admin UI to permanently delete old records
3. **Export before purge**: Export deleted records to file before permanent deletion
4. **Archive table**: Move old deleted records to archive table instead of deleting

## Consequences

### Positive

- **Recoverable**: Accidental deletions can be restored
- **Audit trail**: Tracks who deleted, when deleted
- **Referential integrity**: Foreign keys work with soft deletes
- **Fast deletes**: UPDATE statement (no transaction complexity)
- **Simple implementation**: Just 3 fields per model
- **Consistent pattern**: Same pattern across all entities
- **Supports "Undo"**: Can add UI to restore deleted items
- **Good user experience**: "Delete" feels instant, can add undo

### Negative

- **Query complexity**: Must remember to filter deleted records
- **Storage growth**: Deleted records remain in database
- **Database bloat**: Must implement cleanup jobs
- **Index overhead**: Additional indexes on deleted fields
- **Confusion potential**: New developers may forget to filter deleted records
- **Foreign key confusion**: Related records may be deleted while parent not

## Mitigation Strategies

1. **Helper Functions**: Create `findActiveUsers()`, `findActiveUserById()` functions that always filter deleted records with `eq(users.isDeleted, false)`

2. **TypeScript Types**: Create `ActiveUser` type that enforces isDeleted = false

3. **Consistent Patterns**: All service functions that query entities should include the `isDeleted` filter by default

4. **Documentation**: Document soft delete pattern in developer guide

5. **Linting**: Add linter rule to warn when querying without filtering deleted records

6. **Cleanup Jobs**: Implement scheduled tasks to permanently delete old soft-deleted records

## Related ADRs

- [ADR-001](adr-001-sqlite-database.md): SQLite storage for soft-deleted records
- [ADR-003](adr-003-rbac-system.md): RBAC permissions for delete/restore operations
