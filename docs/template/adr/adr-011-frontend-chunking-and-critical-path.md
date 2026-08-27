# ADR-011: Frontend Chunking and the Critical-Path Budget

## Status

Accepted

## Context

Vite 8 bundles with rolldown rather than rollup. Rolldown accepts a `manualChunks(id)` callback for
backward compatibility, but only partially honours it: the callback is consulted and returns correct
values, while the build silently discards some groups and places modules elsewhere. Nothing warns.

In the 3.25.1 build this produced three defects at once:

- The `ui-utils` and `recharts-d3` groups **never materialised as chunks at all**, despite the
  callback returning those names.
- The React runtime (`react.production.js`, `jsx-runtime`, `react-dom/index`) landed in the
  `grid-layout` chunk instead of `react-core`. The chunk named `grid-layout` _was_ the React chunk.
- Because both the entry chunk and `react-core` therefore statically imported `grid-layout`, and
  `removeModulePreloadPlugin` stripped that chunk's `modulepreload` hint from `index.html`, React
  itself was discovered only after `react-core` had been fetched and parsed. Every page load paid a
  serialised round trip, and every visitor downloaded `react-grid-layout` — a library used on exactly
  one page.

An earlier audit (`audit-lighthouse-1777390912-grid-layout-modulepreload-pollution`) diagnosed this
correctly in its own text — _"shared runtime code co-located with react-grid-layout must be extracted
into a separate chunk"_ — but the remediation shipped `removeModulePreloadPlugin`, which removed the
preload hint while leaving React in the grid chunk. That converted extra bytes into an extra round
trip and marked the finding resolved.

The regression survived because the only build gate, `verify-minification`, caps **total JS bytes**.
Moving React between chunks changes that total by zero. The bug was invisible to the gate by
construction, and the config comments asserted an arrangement the build was not producing.

## Decision Drivers

- **The build must do what the config says.** A chunking API that silently half-applies is
  unreviewable; correctness cannot depend on reading the config and assuming.
- **Shape matters as much as size.** Two builds with identical byte totals can differ by a full
  round trip on every page load. A budget that cannot see this will not hold the line.
- **Invariants must be machine-checked.** ADR-009 was written after a rate-limit setting flipped four
  times because no policy was recorded. The same failure mode applies here: without an executable
  assertion, the next agent re-derives the arrangement from scratch and patches symptoms.

## Considered Alternatives

### Alternative 1: Keep `manualChunks` and work around the misplacement

Pros:

- No config migration; familiar rollup API.

Cons:

- The misapplication is silent and undocumented, so workarounds are guesswork.
- No way to assert the outcome — the callback's return value is not what ships.

### Alternative 2: Split Radix, sonner and cmdk into their own chunks

Pros:

- `react-core` drops from 464 KB to 339 KB raw, which reads as a large win.

Cons:

- **Measured, and it made things marginally worse** (224 KB vs 222 KB brotli). `AppShell` imports
  those packages statically, so Vite correctly preloads the new chunks too. Chunking cannot remove
  what an eager import requires; only making the import lazy can.

### Alternative 3: Extend the existing total-bytes budget

Pros:

- No new script; one gate to maintain.

Cons:

- Structurally blind to this bug class. Verified: rebuilding the pre-fix config, the size budget
  **passed** at 197.08 KB while React sat in a non-preloaded chunk.

## Decision Outcome

Chosen alternative: migrate to rolldown's native manual-chunking API and enforce the result.

> **2026-07-21 update:** rolldown 1.1.5 renamed that API from `advancedChunks` to `codeSplitting`
> and deprecated the old name, which warned on every build. `frontend/vite.config.ts` now declares
> `codeSplitting`; the group shape is unchanged and the emitted chunk graph is identical. The
> decision below stands — only the option name moved. Note that rolldown **ignores**
> `advancedChunks` entirely when both are set, so the two must never coexist.

**Why this alternative was chosen:**

- The groups are matched by explicit `priority`, and the emitted chunks match the
  declaration — the config becomes reviewable again.
- `scripts/check-critical-path.ts` asserts the three properties that actually matter:
    1. **Budget** — brotli bytes of entry + modulepreloads + blocking CSS, against
       `scripts/critical-path-budget.json` (`--update-budget` for intentional growth).
    2. **Runtime placement** — the React runtime must live in a chunk `index.html` preloads.
    3. **No waterfall** — the entry chunk must never statically import a non-preloaded chunk. That
       combination _is_ the round-trip bug by definition.
- `removeModulePreloadPlugin` was deleted. With chunking correct it was provably a no-op (builds with
  and without it are byte-identical), and leaving it would let a future static import silently
  re-hide the same preload.

Constraints worth knowing when editing `frontend/vite.config.ts`:

- **One group per chunk name.** Two groups sharing a `name` emit two separate chunks.
- Radix primitives used only by the eagerly-imported AppShell stay in `react-core` (see
  Alternative 2). Page-only Radix (react-select, react-checkbox, react-switch, react-tabs,
  react-popover) is excluded from the `react-core` regex so the bundler places it in lazy page
  chunks. Radix Dialog and its scroll-lock internals live in `radix-dialog`; every shell consumer
  is lazy-loaded, including the mobile navigation drawer and bug-report form. sonner and cmdk have
  their own explicit chunks and are lazy-loaded.

## Consequences

### Positive

- Critical path fell from 218.2 KB brotli across two waterfall hops to 183.9 KB across one.
- `ui-utils` and `recharts-d3` exist as intended; `grid-layout` holds only grid libraries.
- The regression now fails CI. Verified against the pre-fix build: exit 1, with both structural
  checks naming the cause.
- `verify-minification` — which was present in no smoke mode and therefore never ran — is now wired
  in alongside it.

### Negative

- The first load fetches 13 blocking assets rather than 6. This is a win under HTTP/2 multiplexing
  and better for cache granularity, but nginx listens on plain HTTP (TLS terminates at an external
  reverse proxy), so it assumes the operator's edge speaks HTTP/2 or better.
- The budget carries a churn allowance so two builds of one unchanged tree do not flap the gate, so
  it will not catch creep below that allowance. The structural checks have no such tolerance.
- Critical-path JS fell from 194.3 KB to 169 KB gzip, meeting the 170 KB target from
  `frontend-bundle-optimization`. The gap was closed not by chunk tuning but by lazy-loading
  the consumers that forced sonner, cmdk, and page-only Radix primitives onto the critical
  path: the `Toaster` (React.lazy in `App.tsx`), `CommandPalette` (React.lazy in `AppShell`),
  `NotificationBell`, `BackendUnreachableBanner`, `ImpersonationBanner`, and `ShortcutsHelp`.
  API-layer toast calls go through a dynamic-import adapter (`lib/lazyToast.ts`) so the
  `queryClient` error cache and `tokenRefresh` no longer pull sonner into the entry chunk.
- After the refreshed Radix graph raised the result back above the target, the feature-gated
  bug-report form and mobile-only navigation drawer were deferred too. Radix Dialog now stays in
  its own lazy chunk, and the current critical path is 167.62 KiB gzip JavaScript. The gate measures
  that value separately from the combined Brotli/CSS budget and enforces its own ceiling.

> **2026-08-27 update (v3.44.2):** the churn allowance was 10% of the measurement and is now a flat
> 2 KB. Two builds of one unchanged tree measured four bytes apart, so a percentage was granting
> about 17 KB of slack for a job needing a few hundred bytes, and a ceiling with that much room in it
> stops ratcheting. The gzip ceiling is also no longer the hand-set 170 KiB figure named above; both
> limits are now generated from a measurement plus the pad. Separately, `scripts/init.ts` regenerates
> the budget from a new application's own first build, so a derived application is graded against its
> own number rather than the template's from its first commit onward.

## Related ADRs

- [ADR-007](adr-007-bun-package-manager.md): Bun Package Manager Enforcement — the toolchain this
  build runs on.
- [ADR-009](adr-009-rate-limit-policy.md): Rate-Limit Auth Exemption Policy — same failure mode, an
  invariant nobody recorded and everyone re-derived.
