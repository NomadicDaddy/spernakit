# ADR-005: JSON Configuration System Instead of .env

## Status

Accepted

## Context

Applications need flexible configuration for:

- Different environments (development, staging, production)
- Different deployment scenarios (local, Docker, cloud)
- Security (secrets, API keys, database credentials)
- Feature flags and runtime settings
- Environment-specific values (ports, URLs, timeouts)

We needed a configuration system that:

- Works with Bun runtime configuration
- Provides clear structure and validation
- Supports multiple environments
- Doesn't compromise security
- Is easy to maintain and update
- Works well with monolithic Docker deployment

## Decision Drivers

- **Zero-configuration deployment**: App should work out of box for development
- **Structured configuration**: Validate config at startup, fail fast on errors
- **Environment flexibility**: Support dev, staging, production profiles
- **Security**: Don't commit secrets to git
- **Type-safe**: TypeScript should catch config errors
- **JSON schema**: Validate configuration structure
- **Bun compatibility**: Bun has `env = false` in `bunfig.toml`, doesn't auto-load `.env`

## Considered Alternatives

### Alternative 1: .env Files with dotenv

Pros:

- Industry standard, widely understood
- Simple to implement
- Works with most frameworks
- Easy to override in production (environment variables)

Cons:

- **Not loaded by Bun**: Bun has `env = false` in `bunfig.toml`
- **No structure**: Flat key-value pairs, no nesting
- **No validation**: Can't validate configuration at startup
- **Type-unsafe**: All values are strings, require manual parsing
- **Security risk**: Easy to accidentally commit `.env` file
- **No documentation**: Must maintain separate docs
- **Difficult for complex config**: Nested structures require awkward key names

### Alternative 2: Environment Variables Only

Pros:

- Works in all environments (Docker, Kubernetes, cloud)
- No file dependencies
- Easy to override in production
- Standard for containerized apps

Cons:

- **Flat structure**: No nesting, all keys at root level
- **No validation**: No schema, no type checking
- **Type-unsafe**: All values strings
- **Difficult to document**: Must maintain separate schema docs
- **Poor DX**: Development requires setting many environment variables
- **Hard to manage**: Complex configurations become unwieldy (hundreds of vars)
- **No defaults**: Must set every variable or app fails

### Alternative 3: YAML Configuration Files

Pros:

- More human-readable than JSON
- Supports comments
- Better than flat .env
- Widely used (Kubernetes, Docker Compose)

Cons:

- **Not native to TypeScript**: Requires YAML parser
- **More complexity**: Additional dependency
- **Slower**: Must parse YAML at startup
- **No type safety**: Requires type assertion
- **Not standard for Node.js**: Most use JSON or .env
- **Validation still needed**: Requires separate schema validation

### Alternative 4: Multiple JSON Config Files (config.dev.json, config.prod.json, etc.)

Pros:

- Clear separation of environments
- Structure and nesting
- Type-safe with TypeScript interfaces
- Easy to switch environments

Cons:

- **Configuration duplication**: Copy-paste between files
- **Difficult to maintain**: Change must be propagated across all files
- **Merge complexity**: Base config + env config is tricky
- **Hard to see full picture**: Must open multiple files
- **Environment override still needed**: Production values via env vars
- **Validation complexity**: Multiple files to validate

### Alternative 5: JSON Configuration with Environment Variable Overrides (Selected)

Pros:

- **Structured**: Nested JSON for clear organization
- **Type-safe**: TypeScript interfaces catch errors
- **Validated**: JSON schema validates config at startup
- **Environment-aware**: Base config + environment variable overrides
- **Zero-config for dev**: Default values work out of box
- **Documentation**: JSON is self-documenting with comments (schema)
- **Bun-compatible**: Explicitly loads JSON files
- **Easy to deploy**: Single config file in container
- **Feature flags**: Can enable/disable features in config
- **Security**: Secrets can be overridden by env vars (not committed)

Cons:

- **More complex than .env**: Requires understanding of priority chain
- **JSON doesn't support comments**: But schema and docs provide context
- **Manual env var mapping**: Must map env vars to JSON paths
- **Less standard**: Most apps use .env

## Decision Outcome

Chosen alternative: JSON configuration with environment variable overrides and schema validation

**Why this alternative was chosen:**

1. **Bun compatibility**: Bun doesn't auto-load `.env` files (`env = false`). Loading JSON explicitly is a natural fit and works with Bun's design instead of against it.

2. **Structured Configuration**: Nested JSON provides clear organization:

    ```json
    {
    	"app": { "name": "...", "slug": "..." },
    	"database": { "url": "file:./data/spernakit.db" },
    	"security": { "cookieSecret": "...", "jwtSecret": "..." },
    	"server": { "backendPort": 3331, "frontendPort": 3330 }
    }
    ```

3. **Type-Safe**: TypeScript interfaces enforce config structure. Compile-time errors if accessing non-existent config values.

4. **Type Validation**: TypeScript interfaces in `configLoader.ts` enforce configuration structure at startup. Fail fast with clear error messages.

5. **Priority chain** (Environment > JSON > Defaults):
    - Environment variables override JSON config (good for secrets)
    - JSON config provides defaults (good for development)
    - Code has fallback values (last resort)

6. **Zero-Configuration for Development**: `config/spernakit.json` has sensible defaults. New developers run `bun install && bun run dev` and app works immediately.

7. **Production-Ready**: Secrets provided via environment variables (Docker, Kubernetes, cloud platforms). JSON config provides defaults for non-secret settings.

8. **Feature Flags**: Enable/disable features in config:

    ```json
    {
    	"features": {
    		"apiDocs": { "enabled": false },
    		"monitoring": { "enabled": true }
    	}
    }
    ```

9. **Documentation**: JSON schema serves as documentation. JSON structure is self-documenting.

10. **Easy Deployment**: Single `config/spernakit.json` file in container. Environment variables for secrets (JWT_SECRET, DATABASE_URL, etc.).

## Implementation Details

### Configuration Priority Chain

1. **Code Defaults** (`backend/src/config/defaults.json`)
    - Lowest priority
    - Hardcoded fallback values
    - Ensures app has some values if everything else fails

2. **JSON Configuration** (`config/spernakit.json`)
    - Medium priority
    - Commit to git (no secrets)
    - Provides environment-specific defaults

3. **Environment Variables**
    - Highest priority
    - Override JSON config
    - Used for secrets (JWT_SECRET, DATABASE_URL)
    - Set in Docker, Kubernetes, cloud platforms

### Example Configuration

```json
{
	"app": {
		"description": "Enterprise application template",
		"name": "Spernakit",
		"slug": "spernakit"
	},
	"database": {
		"url": "file:./data/spernakit.db"
	},
	"security": {
		"cookieSecret": "your-cookie-secret-change-in-production",
		"encryptionKey": "your-encryption-key-change-in-production",
		"jwtPrivateKey": "GENERATE_EC_P256_KEY_PAIR",
		"jwtPublicKey": "GENERATE_EC_P256_KEY_PAIR",
		"jwtRefreshPrivateKey": "GENERATE_EC_P256_KEY_PAIR",
		"jwtRefreshPublicKey": "GENERATE_EC_P256_KEY_PAIR"
	},
	"server": {
		"backendPort": 3331,
		"frontendPort": 3330,
		"host": "127.0.0.1"
	},
	"websocket": {
		"enabled": true,
		"path": "/ws",
		"port": 3331
	}
}
```

### Environment Variable Mapping

```bash
# Security secrets (slug-prefixed, auto-mapped)
SPERNAKIT_JWT_PRIVATE_KEY=...
SPERNAKIT_JWT_PUBLIC_KEY=...
SPERNAKIT_JWT_REFRESH_PRIVATE_KEY=...
SPERNAKIT_JWT_REFRESH_PUBLIC_KEY=...
SPERNAKIT_COOKIE_SECRET=...
SPERNAKIT_ENCRYPTION_KEY=...
SPERNAKIT_DATABASE_URL=file:./data/myapp.db
SPERNAKIT_API_KEY=...
```

### Schema Validation

Configuration is validated at startup using a TypeBox schema defined in `configSchema.ts`. Additional custom validation logic lives in `configValidator.ts` (general config validation with warnings) and `configValidator-server.ts` (validates server-specific settings including security key strength). The TypeBox schema provides type inference via `Static<>`, so the validated config object is fully typed throughout the application.

## Security Considerations

- **Secrets in Environment**: SPERNAKIT_JWT_PRIVATE_KEY, SPERNAKIT_COOKIE_SECRET, SPERNAKIT_ENCRYPTION_KEY provided via env vars, never committed to git
- **Restrictive File Mode**: When `config/{slug}.json` is auto-created it may hold placeholder (or, if edited in place, real) secret material (`jwtPrivateKey`, `cookieSecret`, `encryptionKey`). It is written with mode `0o600` (owner read/write only) so other local OS users cannot read master key material under the `multi_user_local` profile. Any future path that persists non-placeholder secrets to the config file must use `0o600` as well.
- **Git Ignore**: `.env` files in `.gitignore`
- **Validation**: Config schema validates at startup, fails fast on missing/invalid config
- **Type-Safe**: TypeScript prevents accessing non-existent config values
- **Generation Script**: `bun scripts/generate-keys.ts` creates secure keys for development

## Consequences

### Positive

- **Structured**: Clear nested organization
- **Type-safe**: TypeScript catches errors at compile time
- **Validated**: JSON Schema validates at startup
- **Zero-config for dev**: Works out of box with defaults
- **Production-ready**: Environment variables for secrets
- **Documented**: JSON schema provides documentation
- **Bun-compatible**: Works with Bun's env=false setting
- **Feature flags**: Enable/disable features in config
- **Single source of truth**: One config file per environment
- **Easy deployment**: Docker containers include config file

### Negative

- **More complex than .env**: Requires understanding of priority chain
- **JSON no comments**: No inline comments (but schema provides docs)
- **Manual env var mapping**: Must explicitly map env vars to JSON paths
- **Less standard**: More apps use .env (but Bun's env=false makes JSON natural choice)

## Related ADRs

- [ADR-001](adr-001-sqlite-database.md): SQLite database URL in config
- [ADR-002](adr-002-cookie-based-jwt-auth.md): JWT secrets in config
- [ADR-003](adr-003-rbac-system.md): RBAC permissions in config
