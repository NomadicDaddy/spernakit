# Testing & Verification Guide

This guide covers the verification infrastructure retained in Spernakit v3.

## Verification Overview

Spernakit uses smoke tests, crawl tests, and integration scripts to check application health across environments. There are no unit test frameworks; crawltest exercises features end-to-end in the running application.

### Retained Verification Paths

| Command                               | Purpose                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `bun run smoke:qc`                    | Check-only quality gate - typecheck, lint, build, format check, dependency checks |
| `bun run qc:fix`                      | Repair lint/format drift, then run `smoke:qc`                                     |
| `bun run smoke:dev`                   | Start services, crawltest in dev mode, stop                                       |
| `bun run smoke:preview`               | Auth-reset UI check + crawltest in preview mode                                   |
| `bun run smoke:docker-local`          | Docker Compose local stack + crawltest                                            |
| `bun run smoke:docker-prod`           | Production Docker stack + crawltest                                               |
| `bun run smoke:reset`                 | Full reset - clear logs, reset packages, QC, Docker build                         |
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

1. Template drift check - `bun run check:drift`
2. Application check - `bun run check-application`
3. TypeScript type checking - `bun run typecheck`
4. ESLint linting - `bun run lint`
5. Production build - `bun run build`
6. API type contract validation - `bun run check:api-types`
7. Prettier formatting - `bun run format:check`
8. Dependency version check - `bun run check-deps`

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

**When to use**: Before releases, after major refactors, or when you need to confirm everything works across all deployment targets.

## Page Testing (Crawl Tests)

Crawl tests verify pages render correctly, have no console errors, and interactive elements work.

### Full Crawl

```bash
bun run crawltest              # Dev mode - discovers and tests every route
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
- **Web Vitals**: Captures CLS, FCP, INP, LCP, TTFB measurements — **dev builds only**, see below
- **Screenshots**: Optional full-page captures per route (`--screenshot-pages`)

### Crawltest Web Vitals Are a Dev-Only Signal

The crawler harvests Web Vitals from `[Web Vitals] ` console lines, and
`frontend/src/lib/webVitals.ts` emits those only under `import.meta.env.DEV`. A production build
buffers metrics and POSTs them to the backend silently instead, so **a crawl against a production
build captures zero Web Vitals** — that is expected, not a failure.

Two consequences worth internalising before acting on these numbers:

- Every Web Vitals figure in `logs/crawltest.json` is a **dev-bundle** measurement. Dev React is
  unminified and unoptimised; the values are not comparable to production.
- Dev additionally sets `reportAllChanges: true` for **CLS and INP only**, so those two are the worst
  intermediate value observed rather than the Core Web Vitals definitions (INP p98, CLS
  session-window maximum). They will read worse than reality and must not be compared to CWV
  thresholds. FCP, LCP and TTFB do not use this setting and are the stable values.

Treat crawltest vitals as a relative dev-time smoke signal. **For production numbers, read the field
metrics** the app POSTs to `/api/v1/system/web-vitals`, surfaced under Settings → System Health.

`crawltest` records which build it measured as `servedBuild` in `logs/crawltest.json`, warns when
serving a production build, and refuses `--mode preview` pointed at a dev server. Note that
`--mode` alone selects nothing — the URL comes from `server.frontendUrl` in either case, so whatever
is listening on that port is what gets measured.

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
