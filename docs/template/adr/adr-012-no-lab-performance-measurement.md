# ADR-012: Field Web Vitals as the Performance Signal, No Lab Measurement

## Status

Accepted

## Context

Lighthouse CI was added on 2026-04-24 — `@lhci/cli`, a `scripts/lighthouse.ts` desktop-then-mobile
driver, `lighthouserc*.json`, and a CI job with artifact retention. It worked and produced real data.

It was removed one week later, on 2026-05-01, because `@lhci/cli` pulled vulnerable `tmp` and `uuid`
transitive dependencies (`audit-security-1777614355-lhci-transitive-vulnerabilities`). Removing it
was the right call.

What did not happen is a decision about the gap it left. The consequences accumulated quietly:

- Every LIGHTHOUSE audit since reports SKIPPED / data-unavailable (2026-06-28, 2026-07-07), and the
  2026-07-18 run withholds category scores entirely because no Lighthouse JSON exists. A permanent
  condition reads like a recurring finding.
- Acceptance criteria in `frontend-bundle-optimization` still reference `lighthouserc.mobile.json`
  and `bun run lighthouse:collect`. Those steps can never pass, yet the feature was marked complete
  and passing.
- `crawltest` looked like a substitute but is not: it harvests Web Vitals from console lines that
  `frontend/src/lib/webVitals.ts` emits only under `import.meta.env.DEV`, and dev additionally sets
  `reportAllChanges: true` for CLS and INP. Two findings — INP 792 ms and CLS 0.111–0.124 — were
  raised from those numbers and consumed several investigation cycles before being closed as
  measurement artifacts.

The absence of an explicit decision cost more than the absence of the tool.

## Decision Drivers

- **A permanent condition must not present as a finding.** Audits that report SKIPPED indefinitely
  train readers to ignore them.
- **Field data beats lab data for this application.** Spernakit is self-hosted and LAN-deployed. Real
  users on real hardware are more representative than a synthetic run on a CI runner, and the
  collection pipeline already exists.
- **Security posture is not negotiable for a convenience.** Any restoration must not reintroduce the
  dependency chain that caused the removal.
- **The regression that actually shipped was structural, not a score.** See ADR-011: React ended up
  in a non-preloaded chunk. A Lighthouse score might have drifted a point or two; an assertion caught
  it exactly.

## Considered Alternatives

### Alternative 1: Restore `@lhci/cli`

Pros:

- Turnkey; the configuration and driver script already existed and can be recovered from history.

Cons:

- Reintroduces the exact transitive vulnerabilities the removal was performed to eliminate.

### Alternative 2: Drive the `lighthouse` library directly from the existing Puppeteer dependency

Pros:

- Avoids `@lhci/cli`, which was the actual CVE vector; `lighthouse` itself is a separate package.
- Puppeteer is already a devDependency for `crawltest`, so no new browser tooling.

Cons:

- Needs its own dependency audit before adoption, and ongoing maintenance of the driver and budgets.
- Lab scores on a shared CI runner are noisy; thresholds tend to be loosened until they stop failing.

### Alternative 3: Treat `crawltest` Web Vitals as the lab signal

Pros:

- Already runs in several smoke modes; no new tooling.

Cons:

- Structurally invalid. Capture is dev-only, and `reportAllChanges` makes CLS and INP
  worst-intermediate values rather than the Core Web Vitals definitions. This alternative has already
  been tried by accident and produced two false findings.

## Decision Outcome

Chosen alternative: accept no lab performance measurement, and treat field Web Vitals as the
production signal.

**Why this alternative was chosen:**

- The collection path already exists end to end and needs no new dependency: the app POSTs batches to
  `/api/v1/system/web-vitals`, `getWebVitalsSummary()` aggregates them at **p75** (the Core Web Vitals
  definition), and Settings → System Health renders the result for OPERATOR and above.
- Build-shape regressions — the class that actually shipped — are covered deterministically by
  `bun run check:critical-path` (ADR-011), with no browser, no runner variance, and no flake.
- `crawltest` Web Vitals remain useful as a **relative dev-time smoke signal** and are documented as
  such in `docs/template/TESTING.md`. They are not evidence about production.

Operationally, the LIGHTHOUSE audit is marked excluded in `.aidd/audit-profile-overrides.json` so a
settled decision stops surfacing as a repeated gap.

Alternative 2 remains the route to revisit if synthetic scores are ever wanted in CI. It is deferred,
not rejected on merit.

## Consequences

### Positive

- No synthetic performance dependency, and no CVE surface from one.
- Performance claims rest on measurements from real usage rather than a CI runner.
- Audits stop reporting an intentional absence as a finding.

### Negative

- No pre-merge performance score. A change that degrades runtime performance without changing build
  shape will not be caught before it ships; it will show up in field vitals afterwards.
- Field data requires traffic. A freshly derived application has no vitals until real users generate
  them, so early performance work is unmeasured.
- No lab measurement of accessibility, SEO or best-practices scores either, which Lighthouse also
  provided.

## Related ADRs

- [ADR-011](adr-011-frontend-chunking-and-critical-path.md): Frontend Chunking and the Critical-Path
  Budget — the deterministic gate that replaces the score for build-shape regressions.
