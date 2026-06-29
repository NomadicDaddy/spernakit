# Testing & Verification Guide

This guide covers the verification infrastructure retained in Spernakit v3.

## Verification Overview

Spernakit uses smoke tests, crawl tests, and integration scripts to verify application health across environments. No unit test frameworks are used -- crawltest verifies features end-to-end in the running application.

### Retained Verification Paths

| Command                               | Purpose                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `bun run smoke:qc`                    | Check-only quality gate — typecheck, lint, build, format check, dependency checks |
| `bun run qc:fix`                      | Repair lint/format drift, then run `smoke:qc`                                     |
| `bun run smoke:dev`                   | Start services, crawltest in dev mode, stop                                       |
| `bun run smoke:preview`               | Auth-reset UI check + crawltest in preview mode                                   |
| `bun run smoke:docker-local`          | Docker Compose local stack + crawltest                                            |
| `bun run smoke:docker-prod`           | Production Docker stack + crawltest                                               |
| `bun run smoke:reset`                 | Full reset — clear logs, reset packages, QC, Docker build                         |
| `bun run smoke:screenshots`           | Dev crawltest with screenshot capture                                             |
| `bun run supertest`                   | Full validation chain across all environments                                     |
| `bun run crawltest`                   | Crawl test in dev mode                                                            |
| `bun run crawltest:preview`           | Crawl test in preview mode                                                        |
| `bun run check-auth-reset-api`        | Password reset API endpoint verification                                          |
| `bun run check-auth-reset-ui-dev`     | Password reset UI E2E in dev mode                                                 |
| `bun run check-auth-reset-ui-preview` | Password reset UI E2E in preview mode                                             |

## Quality Control (smoke:qc)

The primary quality gate before every commit:

```bash
bun run smoke:qc
```

Pipeline:

1. Template drift check — `bun run check:drift`
2. Application check — `bun run check-application`
3. TypeScript type checking — `bun run typecheck`
4. ESLint linting — `bun run lint`
5. Production build — `bun run build`
6. API type contract validation — `bun run check:api-types`
7. Prettier formatting — `bun run format:check`
8. Dependency version check — `bun run check-deps`

## Supertest (Full Validation Chain)

```bash
bun run supertest
```

Runs the complete validation chain across all environments:

| Step | Command                      | What It Does                           |
| ---- | ---------------------------- | -------------------------------------- |
| 1    | `bun run smoke:reset`        | Reset packages, database, run QC       |
| 2    | `bun run smoke:dev`          | Start dev servers, crawltest all pages |
| 3    | `bun run smoke:docker-local` | Docker Compose local stack, crawltest  |
| 4    | `bun run smoke:docker-prod`  | Production Docker stack, crawltest     |
| 5    | `bun run smoke:screenshots`  | Dev crawltest with screenshot capture  |

**When to use**: Before releases, after major refactors, or whenever you need full confidence that everything works across all deployment targets.

## Page Testing (Crawl Tests)

Crawl tests verify pages render correctly, have no console errors, and interactive elements work.

### Full Crawl

```bash
bun run crawltest              # Dev mode — discovers and tests every route
bun run crawltest:preview      # Preview mode
```

### Targeted Testing

```bash
# Test a single page
bun scripts/crawltest.ts --page /settings/users

# Test all pages under a route prefix
bun scripts/crawltest.ts --start-from /settings

# Verify the 404 page
bun scripts/crawltest.ts --404

# Combine with screenshots
bun scripts/crawltest.ts --page /dashboard --screenshot-pages
```

### What Crawl Tests Check

- **Content assertions**: Pages have meaningful content (min 50 chars) and headings
- **Error detection**: Console errors, uncaught exceptions, network failures, error boundaries
- **Interactive elements**: Clicks buttons, toggles switches, opens select dropdowns
- **Dialog detection**: Identifies and safely closes modal dialogs
- **Web Vitals**: Captures CLS, FCP, INP, LCP, TTFB measurements
- **Screenshots**: Optional full-page captures per route (`--screenshot-pages`)

### Output

- Console summary with pass/fail status
- Detailed JSON report: `logs/crawltest.json`
- Screenshots (when enabled): `screenshots/*.png`

See `scripts/readme.md` for complete CLI reference and configuration options.

## Authentication Reset Testing

Test the password reset flow end-to-end:

```bash
bun run check-auth-reset-api          # API endpoints
bun run check-auth-reset-ui-dev       # UI in dev mode
bun run check-auth-reset-ui-preview   # UI in preview mode
```

## When to Use Each Verification

| Scenario                                        | Command                                         |
| ----------------------------------------------- | ----------------------------------------------- |
| Before every commit                             | `bun run smoke:qc`                              |
| After changing a specific page                  | `bun scripts/crawltest.ts --page /path`         |
| After changing a feature area                   | `bun scripts/crawltest.ts --start-from /prefix` |
| After adding/changing routing or error handling | `bun scripts/crawltest.ts --404`                |
| Before release                                  | `bun run supertest`                             |
