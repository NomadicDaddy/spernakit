# ADR-007: Bun Package Manager Enforcement

## Status

Accepted

## Context

Modern JavaScript/TypeScript projects have multiple package manager options (npm, yarn, pnpm, bun). Using multiple package managers in a single project causes:

- Inconsistent lockfiles (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lock)
- Different node_modules layouts
- Conflicts in CI/CD pipelines
- Version resolution differences
- Confusion for new developers
- Harder to troubleshoot

We needed to standardize on one package manager that:

- Is fast and efficient
- Provides good developer experience
- Has growing ecosystem
- Supports TypeScript and modern tooling
- Works well with our tech stack (React, Vite, Drizzle, Elysia)
- Enables consistent builds across all environments

## Decision Drivers

- **Consistency**: All developers, CI, and production must use same package manager
- **Performance**: Fast installs and builds
- **Compatibility**: Works with all dependencies (React, Vite, Drizzle, Elysia, etc.)
- **Developer experience**: Simple, reliable, good error messages
- **Monorepo support**: Should work with workspace/multirepo setup
- **Toolchain compatibility**: Integrates well with Vite, TypeScript, Drizzle, Elysia
- **Future-proof**: Active development and community

## Considered Alternatives

### Alternative 1: npm (Node Package Manager)

Pros:

- Default, comes with Node.js
- Widely known, all tutorials use npm
- Largest registry (npmjs.org)
- Most packages tested with npm
- Standard in enterprise

Cons:

- **Slow**: 2-5x slower than bun, pnpm
- **No workspace support before v7**: Multirepo requires npm workspaces (less mature)
- **Inefficient installs**: Downloads all packages even if cached
- **Slower builds**: Takes longer to compile TypeScript
- **Higher memory usage**: More resource-intensive than alternatives

### Alternative 2: yarn v1 (Classic Yarn)

Pros:

- Faster than npm (parallel downloads)
- Introduced workspaces (early multirepo support)
- Popular and well-documented

Cons:

- **Deprecated**: yarn v1 is no longer maintained
- **Must upgrade to v2/v3**: Breaking changes, different CLI
- **Slower than bun**: Not as fast as modern alternatives
- **PnP (Plug'n'Play) issues**: Can cause compatibility problems
- **Maintenance burden**: Yarn development has slowed

### Alternative 3: yarn v2/v3 (Berry)

Pros:

- Very fast (similar to pnpm)
- Modern architecture
- PnP for faster installs
- Good workspace support

Cons:

- **Breaking changes from v1**: Different CLI, different lockfile
- **Complex PnP debugging**: Issues hard to resolve
- **Less adoption**: Fewer projects use Berry
- **Learning curve**: New concepts (PnP, zero-installs)
- **Plugin system**: Additional complexity

### Alternative 4: pnpm

Pros:

- **Very fast**: Efficient disk usage, parallel installs
- **Monorepo support**: Excellent workspace implementation
- **Disk efficient**: Hard-linked files save space
- **Stricter**: Prevents phantom dependencies
- **Popular and mature**: Large community, well-documented

Cons:

- **Slower than bun**: Still 2-3x slower than bun in some benchmarks
- **Complex setup**: Requires shell injection (`pnpm setup`) in some environments
- **Stricter validation**: Can cause issues with poorly maintained packages
- **Less integrated than bun**: Not a JavaScript runtime, just package manager

### Alternative 5: Bun (Selected)

Pros:

- **Extremely fast**: 10-30x faster than npm for installs, 2-3x faster than pnpm
- **JavaScript Runtime**: Not just package manager, but full runtime
- **Same tool for everything**: One binary for runtime, package manager, test runner, bundler
- **Integrated quality tooling**: Bun runs the repository's verification commands quickly (`smoke:qc`, `crawltest`, build, typecheck)
- **Compatible with npm**: Installs from npm registry, works with npm scripts
- **Excellent monorepo support**: Workspaces first-class feature
- **Low memory usage**: Significantly less memory than npm, yarn
- **TypeScript support**: Built-in TypeScript compilation
- **Growing ecosystem**: Active development, 50K+ GitHub stars (as of 2025)
- **Docker-friendly**: Single binary, small Docker images
- **Bun-specific features**: Native glob patterns, faster fs operations

Cons:

- **Newer project**: Released 2023, less mature than npm (2009)
- **Smaller ecosystem**: Fewer packages specifically designed for bun (but npm compatibility)
- **Breaking changes**: Bun moves fast, some versions have breaking changes
- **Learning curve**: Developers familiar with npm may need to adjust
- **IDE integration**: Some IDEs don't fully support bun yet
- **Community**: Smaller than npm, though growing rapidly

## Decision Outcome

Chosen alternative: Bun package manager and runtime

**Why this alternative was chosen:**

1. **Performance**:
    - Installs: 10-30x faster than npm, 2-3x faster than pnpm
    - Builds: Significantly faster TypeScript compilation
    - Verification: Bun executes the repository's quality gates quickly (`smoke:qc`, `crawltest`)
    - Overall: 10-20% improvement in development cycle time

2. **Single Toolchain**:
    - Runtime: `bun run dev` (node replacement)
    - Package manager: `bun install`, `bun add` (npm replacement)
    - Verification: `bun run smoke:qc`, `bun run crawltest`, `bun run supertest`
    - Bundler: `bun build` (webpack/vite replacement, though we use Vite)
    - One binary for everything reduces toolchain complexity

3. **npm Compatibility**: Installs from npm registry, works with all npm packages. No ecosystem lock-in.

4. **Monorepo Support**: Workspaces are first-class. Our monorepo (backend + frontend) works seamlessly:

    ```json
    {
    	"workspaces": ["backend", "frontend", "shared"]
    }
    ```

5. **Low Resource Usage**:
    - Less memory than npm, yarn during installs
    - Faster execution (JIT compilation)
    - Better for CI/CD pipelines (lower resource costs)

6. **Modern Features**:
    - Fast execution for repo quality gates and script automation
    - Faster file system operations
    - Native glob pattern matching
    - Built-in TypeScript compilation

7. **Docker Optimization**:
    - Single binary (~50MB) vs Node.js (~30MB) + npm
    - Smaller Docker images
    - Faster container startup
    - Works great in Alpine Linux

8. **Active Development**:
    - Rapid releases (new features, bug fixes)
    - Excellent Discord community
    - Responsive to issues
    - Clear roadmap

9. **Vite Compatibility**: Works seamlessly with Vite (our build tool). Vite team has added Bun-specific optimizations.

10. **Future-Proof**: Bun is designed for modern JavaScript/TypeScript and is actively competing to be the fastest.

## Implementation Details

### package.json Enforcement

Root `package.json`:

```json
{
	"engines": {
		"bun": ">=1.3.14",
		"node": ">=24.0.0 <25.0.0"
	},
	"name": "spernakit",
	"packageManager": "bun@1.3.14",
	"scripts": {
		"build": "bun run build",
		"dev": "bun run dev",
		"install": "bun install",
		"lint": "bun run lint",
		"typecheck": "bun run typecheck"
	}
}
```

### bunfig.toml Configuration

```toml
[install]
peer = false

# Disable automatic .env file loading - we use JSON config exclusively.
env = false

```

### CI/CD Enforcement

```yaml
# .github/workflows/ci.yml
jobs:
    quality:
        steps:
            - name: Install Bun
              run: |
                  curl -fsSL https://bun.sh/install | bash
                  export BUN_INSTALL="$HOME/.bun"
                  export PATH="$BUN_INSTALL/bin:$PATH"
            - name: Install dependencies
              run: bun install
            - name: Verify bun.lock
              run: |
                  # Fail if any package-manager lockfiles other than bun.lock exist
                  if [ -f "package-lock.json" ]; then echo "Error: npm lockfile found"; exit 1; fi
                  if [ -f "yarn.lock" ]; then echo "Error: yarn lockfile found"; exit 1; fi
                  if [ -f "pnpm-lock.yaml" ]; then echo "Error: pnpm lockfile found"; exit 1; fi
            - name: Run quality gate
              run: bun run smoke:qc
            - name: Run crawl verification
              run: bun run crawltest
```

### .gitignore

```
node_modules/
# Block other package managers
package-lock.json
yarn.lock
pnpm-lock.yaml
```

### Documentation

**README.md**:

````markdown
## Prerequisites

- **Bun 1.3.14+** (Required package manager and runtime)

[Install Bun](https://bun.sh)

## Installation

```bash
bun install
```
````

## Running

```bash
bun run dev
```

**Note**: This project requires Bun. Using npm, yarn, or pnpm is not supported.

````

### Developer Guide

```markdown
## Package Manager

This project uses **Bun** as package manager and runtime.

### Installation

```bash
# Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install
````

### Running Scripts

All scripts use Bun:

```bash
bun run dev          # Start development server
bun run build        # Build for production
bun run smoke:qc   # Run quality gate
bun run crawltest  # Run crawler verification
bun run lint        # Run linter
bun run typecheck   # TypeScript type checking
```

### Why Bun?

Bun provides 10-30x faster installs and builds compared to npm. See [ADR-007](./adr-007-bun-package-manager.md) for rationale.

````

## Migration from npm to Bun

If project previously used npm:

1. **Delete old lockfiles**:
   ```bash
   rm package-lock.json yarn.lock pnpm-lock.yaml node_modules
````

2. **Install Bun**:

    ```bash
    curl -fsSL https://bun.sh/install | bash
    ```

3. **Install dependencies**:

    ```bash
    bun install
    ```

4. **Update scripts** (if needed): Replace `npm run` with `bun run`

5. **Update CI/CD**: Replace `npm ci` with `bun install`

## Consequences

### Positive

- **10-30x faster installs**: Significantly improved developer experience
- **Faster builds**: TypeScript compilation is faster
- **Single toolchain**: One binary for runtime, package manager, tests
- **Lower CI/CD costs**: Faster builds use fewer compute resources
- **Better DX**: Modern tooling, fast feedback
- **Smaller Docker images**: Single binary vs node + npm
- **Monorepo support**: Workspaces work seamlessly
- **Active development**: Rapid improvements and bug fixes
- **Future-proof**: Designed for modern JavaScript/TypeScript

### Negative

- **Learning curve**: Developers familiar with npm need to learn bun
- **Newer project**: Less mature than npm (released 2023)
- **Breaking changes**: Bun moves fast, some versions have breaking changes
- **Smaller ecosystem**: Fewer bun-specific packages (but npm compatibility mitigates)
- **IDE integration**: Some IDEs not fully support bun yet
- **Lockfile format**: `.lock` (text-based) is bun-specific
- **Single dependency**: If Bun has critical bug, project blocked (but mitigated by npm compatibility for most packages)

## Risk Mitigation

1. **Version Pinning**: Use `bun: ">=1.3.14"` in engines to prevent incompatible versions
2. **Bun Compat Check**: Use `bunx` to run packages that don't work with bun yet
3. **Fallback to Node**: If critical Bun bug, temporarily use Node (but use Bun for package management)
4. **Lockfile Commit**: Commit `bun.lock` (text format) for reproducible builds
5. **Testing**: Test Bun updates in development before production deployment
6. **Documentation**: Clear instructions for installing and using Bun
7. **CI Validation**: CI/CD validates Bun is used, fails on npm/yarn/pnpm lockfiles

## Related ADRs

- [ADR-005](adr-005-json-configuration.md): JSON configuration (Bun-compatible)
- [ADR-001](adr-001-sqlite-database.md): SQLite database (works with Bun's fs operations)
