# ADR-001: SQLite for Production Database

## Status

Accepted

## Context

Spernakit needed a primary database. The requirements were to:

- Support rapid development and prototyping
- Scale adequately for typical use cases
- Keep deployment simple
- Minimize operational overhead
- Protect data integrity

## Decision Drivers

- Development velocity: setup should be quick
- Deployment simplicity: no external database server for most deployments
- Operational overhead: as little database administration as possible
- Performance: handle typical workloads comfortably
- Zero configuration: work out of the box
- Monolithic deployment: a single container, at least for early releases

## Considered Alternatives

### Alternative 1: PostgreSQL

Pros:

- Mature and production-ready
- Excellent relational features
- Strong community support
- Advanced indexing and query optimization
- JSONB support for flexible schemas
- ACID compliant transaction handling

Cons:

- Requires a separate database server or container
- More complex deployment (multiple services)
- Higher operational overhead (connection pooling, backups, tuning)
- Steeper learning curve
- Overkill for smaller deployments
- More complex disaster recovery

### Alternative 2: MySQL/MariaDB

Pros:

- Widely used and well understood
- Strong relational features
- Good performance
- Extensive tooling

Cons:

- Deployment complexity similar to PostgreSQL
- License considerations with MySQL (MariaDB is OSS)
- More operational overhead than SQLite
- Not as close to zero-configuration as SQLite

### Alternative 3: MongoDB

Pros:

- Flexible document schema
- Horizontal scaling
- Good for unstructured data
- Native JSON support

Cons:

- No schema validation by default
- A document paradigm, not relational
- Requires a separate database server
- More complex for traditional relational use cases
- Risk of data inconsistency without careful design

### Alternative 4: SQLite (Selected)

Pros:

- Zero-configuration deployment (embedded database)
- Single-file database makes backups trivial
- Excellent read performance for most workloads
- ACID compliant with full transaction support
- No separate database server
- Minimal operational overhead
- Well suited to monolithic deployments
- Easy to migrate to PostgreSQL later (Drizzle supports both)

Cons:

- Limited write concurrency (single writer)
- No built-in replication or sharding
- Not ideal for very high write volumes
- Database size bounded by the filesystem (usually fine)
- No server-side connection pooling (single process)

## Decision Outcome

Chosen alternative: SQLite (file-based) as the primary/default dialect.

> **v3 Update**: PostgreSQL is now supported as an alternative dialect. Both SQLite and PostgreSQL schemas are maintained, with parity enforced at the TypeScript type level. See [Migration Path](#migration-path) for details.

**Why SQLite:**

1. **Deployment simplicity**: no configuration needed. The database file is created automatically - no database server to set up, no connection string, no external service dependency.

2. **Fits the monolithic architecture**: Spernakit runs as a single container using nginx + supervisord. SQLite lives alongside the application in that same container.

3. **Development velocity**: developers start immediately, with nothing to install and no local credentials to manage.

4. **Operational simplicity**: back up the database by copying the `.db` file. No `pg_dump`, no backup jobs, and recovery is straightforward.

5. **Adequate performance**: for typical applications (1,000-10,000 users, moderate concurrent writes), SQLite is more than enough. The write limits rarely come up in practice.

6. **A path forward**: Drizzle ORM supports both SQLite and PostgreSQL. When an app outgrows SQLite, moving to PostgreSQL is straightforward - the schema is already defined and Drizzle generates the SQL.

7. **Cost**: no managed database service (RDS, Cloud SQL) needed for smaller deployments. SQLite is free.

8. **Transaction safety**: SQLite is fully ACID compliant, so data stays intact through crashes or power loss.

## Consequences

### Positive

- **Zero configuration**: apps start working with no database setup
- **Simpler deployment**: one container holds the whole stack
- **Easy backups**: copy the `.db` file
- **Fast development**: no database server to install or manage
- **Lower cost**: no separate database service for most use cases
- **Reliable**: fewer moving parts, fewer failure points
- **Easy migration**: Drizzle lets you switch to PostgreSQL when needed

### Negative

- **Write concurrency**: the single-writer design limits concurrent writes (rarely an issue in practice)
- **Scaling limits**: not suited to very high write volumes (millions of writes/day)
- **No native replication**: multi-node deployments need a custom solution
- **Database size**: bounded by the filesystem (usually fine, but worth noting)
- **Memory**: some operations load the whole database into memory

## Migration Path

As of v3, Spernakit ships dual-dialect schema support. Both the SQLite (`backend/src/db/schema/`) and PostgreSQL (`backend/src/db/schema-pg/`) schemas live in the repository, with parity enforced through TypeScript type assertions at build time.

When SQLite is no longer enough (for example, >10,000 concurrent users, very high write volume, or multi-region deployment):

1. Set `database.dialect` to `"postgres"` in the application configuration
2. Set `database.url` to a PostgreSQL connection string
3. Run `bun run db:migrate` to apply schema migrations to PostgreSQL
4. Export data from SQLite and import it into PostgreSQL
5. Deploy PostgreSQL alongside the application

Helper functions like `getCurrentDialect()` and `validatePgConnection()` in `backend/src/db/index.ts` support dialect switching. You don't convert `sqliteTable` to `pgTable` by hand - both schemas already exist.

## Related ADRs

- [ADR-005](adr-005-json-configuration.md): JSON configuration for zero-configuration deployment
