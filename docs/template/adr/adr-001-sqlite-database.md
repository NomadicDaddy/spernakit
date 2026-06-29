# ADR-001: SQLite for Production Database

## Status

Accepted

## Context

When designing Spernakit as a production-ready enterprise application template, we needed to choose a primary database system that would:

- Support rapid development and prototyping
- Scale adequately for typical enterprise use cases
- Provide deployment simplicity
- Minimize operational overhead
- Ensure data integrity and reliability

## Decision Drivers

- Development velocity: Database setup should be quick and painless
- Deployment simplicity: No external database server required for most deployments
- Operational overhead: Minimize database administration tasks
- Sufficient performance: Must handle typical enterprise workloads
- Zero-configuration: Database should work out of the box
- Monolithic deployment: Single container deployment preferred for initial releases

## Considered Alternatives

### Alternative 1: PostgreSQL

Pros:

- Mature, production-ready database
- Excellent relational features
- Strong community support
- Advanced indexing and query optimization
- JSONB support for flexible schemas
- ACID compliance with robust transaction handling

Cons:

- Requires separate database server or container
- More complex deployment (multiple services)
- Higher operational overhead (connection pooling, backups, tuning)
- Steeper learning curve for developers
- Overkill for many smaller deployments
- More complex disaster recovery

### Alternative 2: MySQL/MariaDB

Pros:

- Widely used and well-understood
- Strong relational features
- Good performance characteristics
- Extensive tooling ecosystem

Cons:

- Similar deployment complexity to PostgreSQL
- License considerations with MySQL (though MariaDB is OSS)
- More operational overhead than SQLite
- Not as zero-configuration as SQLite

### Alternative 3: MongoDB

Pros:

- Flexible document schema
- Horizontal scaling capability
- Good for unstructured data
- Native JSON support

Cons:

- No schema validation by default
- Different paradigm (document vs relational)
- Requires separate database server
- More complex for traditional relational use cases
- Potential for data inconsistency without careful design

### Alternative 4: SQLite (Selected)

Pros:

- Zero-configuration deployment (embedded database)
- Single-file database makes backups trivial
- Excellent read performance for most workloads
- ACID compliant with full transaction support
- No separate database server needed
- Minimal operational overhead
- Excellent for monolithic deployments
- Easy to migrate to PostgreSQL later (Drizzle supports both)

Cons:

- Limited write concurrency (single writer)
- No built-in replication or sharding
- Not ideal for extremely high-write workloads
- Database size limited by filesystem (typically adequate)
- No server-side connection pooling (single process)

## Decision Outcome

Chosen alternative: SQLite (file-based database) as the primary/default dialect.

> **v3 Update**: PostgreSQL is now supported as an alternative dialect. Both SQLite and PostgreSQL schemas are maintained with parity enforced at the TypeScript type level. See [Migration Path](#migration-path) for details.

**Why this alternative was chosen:**

1. **Deployment Simplicity**: SQLite requires zero configuration. The database file is created automatically, eliminating the need for database server setup, connection string configuration, or external service dependencies.

2. **Monolithic Architecture Alignment**: Spernakit is designed as a monolithic single-container application using nginx + supervisord. SQLite fits perfectly with this architecture - the database lives alongside the application in the same container.

3. **Development Velocity**: Developers can start working immediately without database setup. No need to install Docker Compose for database, configure connection strings, or manage database credentials during local development.

4. **Operational Simplicity**: Backups are as simple as copying the `.db` file. No need to configure pg_dump or database backup jobs. Disaster recovery is straightforward.

5. **Adequate Performance**: For typical enterprise applications (1000-10,000 users, moderate concurrent writes), SQLite's performance characteristics are more than adequate. Write limitations are rarely hit in real-world scenarios.

6. **Migration Path Forward**: Drizzle ORM supports both SQLite and PostgreSQL. When the application outgrows SQLite, migration to PostgreSQL is straightforward - the schema is already defined, and Drizzle generates the appropriate SQL. This provides a safe upgrade path.

7. **Cost Effective**: No need for managed database services (AWS RDS, Google Cloud SQL, etc.) for smaller deployments. The database is free.

8. **Transaction Safety**: SQLite is fully ACID compliant, ensuring data integrity even in cases of crashes or power loss.

## Consequences

### Positive

- **Zero Configuration**: Applications start working immediately without database setup
- **Simplified Deployment**: Single Docker container can contain entire application stack
- **Easy Backups**: Copy the `.db` file for full backup
- **Fast Development**: No database server installation or management overhead
- **Lower Costs**: No separate database server or managed service required for most use cases
- **Excellent Reliability**: SQLite's simplicity reduces failure points
- **Easy Migrations**: Drizzle allows switching to PostgreSQL when needed

### Negative

- **Write Concurrency Limitation**: Single-writer design limits concurrent writes (rarely an issue in practice)
- **Scaling Boundaries**: Not suitable for extremely high-write workloads (millions of writes/day)
- **No Native Replication**: Requires custom solutions for multi-node deployments
- **Database Size**: Limited by filesystem size (usually adequate, but worth noting)
- **Memory Requirements**: Entire database loads into memory for certain operations

## Migration Path

As of v3, Spernakit ships with dual-dialect schema support. Both SQLite (`backend/src/db/schema/`) and PostgreSQL (`backend/src/db/schema-pg/`) schemas are maintained in the repository, with schema parity enforced via TypeScript type assertions at build time.

When SQLite becomes insufficient (e.g., >10,000 concurrent users, extremely high write volume, or multi-region deployment needs):

1. Set `database.dialect` to `"postgres"` in the application configuration
2. Set `database.url` to a PostgreSQL connection string
3. Run `bun run db:migrate` to apply schema migrations to PostgreSQL
4. Export data from SQLite and import into PostgreSQL
5. Deploy PostgreSQL alongside application

Helper functions such as `getCurrentDialect()` and `validatePgConnection()` are available in `backend/src/db/index.ts` to support dialect switching. No manual conversion of `sqliteTable` to `pgTable` is required -- both schemas already exist.

## Related ADRs

- [ADR-005](adr-005-json-configuration.md): JSON configuration for zero-configuration deployment
