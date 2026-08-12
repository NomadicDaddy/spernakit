# Spernakit Changelog

This changelog defines the public Spernakit baseline. Future entries will describe changes from
this release.

## [3.41.0] - 2026-08-12

### Added

- `--only <group>` on `bun run generate-keys`, covering seven groups: `app-api-key`,
  `backup-encryption-key`, `cookie-secret`, `encryption-key`, `jwt`, `jwt-refresh`, and `mfa`.
  The script rotated all ten security fields on every run, so provisioning one missing key also
  invalidated every session, every integration credential, and every encrypted value. Selection is
  validated before any backup or write, and the existing-key warning is per group and names what
  that specific rotation breaks rather than the worst case across all ten. It fires only for groups
  that already hold a real value.
- `scripts/lib/key-groups.ts`, holding the key catalog, its field types, and the `--only` parser.
  `generate-keys.ts` crossed the 300 line gate once selection logic landed in it.

### Fixed

- `bun run setup` left `security.backupEncryptionKey` and the MFA key pair at their
  `defaults.json` placeholders while generating the other five secret types. A freshly set up app
  therefore failed its own `bun run config:validate -- --node-env production` preflight on a
  placeholder value, which is the first step of `smoke:docker-prod`, so `bun run supertest` could
  not run at all. `checkMfaKeyPair` no-ops when both MFA fields are empty, so the missing pair
  stayed invisible until production graded the config.
- `generate-keys` rewrote the config with a fixed tab and LF serialization. It is the only script
  that edits an operator owned `config/<slug>.json` in place, so a scoped repair reflowed a
  hand maintained file. It now carries the existing indentation, line endings, and trailing newline
  through the write.
- The MFA remedy text pointed at the unscoped `bun run generate-keys` in three places: the config
  schema hint, the `/api/v1/auth/mfa` handler, and the profile Security tab. Following it to
  provision one missing key rotated the other nine. All three now name
  `bun run generate-keys -- --only mfa`. The placeholder and weak secret hints deliberately still
  name the unscoped command.
- `generate-keys` now imports `PLACEHOLDER_PATTERN` from `configValidator-secrets-checks.ts`
  instead of carrying its own copy, so the script and the validator agree on what counts as
  provisioned.

### Changed

- `github/codeql-action/upload-sarif` pinned to v4.37.6.
- Frontend and development dependencies updated.

## [3.40.0] - 2026-08-11

### Added

- A status vocabulary in the token layer. The app was reaching for raw palette utilities to colour
  state, so "healthy" on `/settings/system-health` and "completed" on `/settings/scheduled-tasks`
  were different greens. Badge now separates state (tinted success/warning/destructive, never a
  saturated fill that cannot reach AA at 12px/500) from identity and metadata, which stay neutral,
  and eslint rejects `hsl(var(--token))` under `src`: the themes are OKLCH, so an HSL wrapper
  renders a different colour without failing.
- `SectionHeader`, the rung between `PageHeader`'s `h1` and `CardTitle`. Section titles were
  hand-rolled and had drifted — on `/settings/system-health` three peer sections rendered smaller
  than the card titles they were heading.
- `UnsavedChangesGuard`, replacing direct `useUnsavedChanges` calls. The hook returns a blocker
  that renders nothing on its own, and two of its four call sites blocked navigation without
  showing a dialog, trapping the user on the page with no way out.
- `OptionCard`/`OptionCardGroup`, `RequiredMark`, and `SettingsNumberField`/`SettingsToggleRow`.
  The auth policy form declared the same labelled numeric field five times across three files,
  each capping its input at a hard 320px that left most of the row empty at wide viewports.
- A filter on runtime config, with the field list and the matching predicate as separate modules
  so a section card drops out whole when nothing inside it matches.
- Server-side filtering on the bug triage inbox: `status`, `kind`, and description `search` are
  query parameters applied in SQL, plus a status-update endpoint behind the inline selector.

### Changed

- `CardTitle` renders an `h2` by default instead of a `div`, and takes `as` for the rest of the
  ladder. It was heading appearance with no heading semantics, so most pages had exactly one
  heading in `<main>`. `EmptyState` and the chart components now take their heading level from the
  caller instead of assuming one.
- `DataTable` composes `DataTableEmptyRow` from a grouped `empty` prop in both the paginated and
  the virtualized body, where it previously drew a bare "No results." cell. The paginated body
  moves to `DataTableRows`, bringing `DataTable` back under the 300-line cap.
- Each workspace settings tab is its own route, sharing state through `useWorkspaceSettings`.
  Member records carry the member's email, so a row can identify a person without printing a row id.
- Profile preferences group into cards by topic. Thirteen controls previously occupied seven
  full-width card headers and roughly 1847px of scroll.
- Audit records render through one `auditAction` helper on both `/settings/audit-logs` and the
  dashboard's Recent activity card, which had shown the same data in two visual languages. POST
  drops from `default` to neutral, which had made every create look clickable.
- Scheduled tasks, backups, workspaces, and users build their tables through `DataTable` and
  per-surface column hooks, matching the rest of settings.
- `TabLayout` tracks overflow separately from scroll position, so the scroll arrows and gradient
  fades appear only on a tab strip that actually scrolls, and it accepts breadcrumbs.
- The analytics time ranges are named once in `timeRange.ts`, and each KPI tile states its own
  window — a row mixing range-scoped metrics with fixed-window ones (DAU, MAU) read as four tiles
  governed by one selector.

### Fixed

- Saving a dashboard layout wrote geometry for every widget on the board, including ones the user
  never touched, because `onLayoutChange` also fires for react-grid-layout's own reflow. Edits are
  tracked in `dirtyIds` and committed through `commitLayoutEdit`. The rebuild is keyed on the
  dashboard id plus its sorted widget ids: `updateDashboard` soft-deletes and re-inserts every
  widget, so the old identity check saw all-new children and reflowed each unmatched one to
  `{x:0, w:1, h:1}`.
- A dashboard with a `NULL` workspace_id — what `importDashboard` and `createFromTemplate` document
  as "global" — was invisible from every workspace, because `eq(workspaceId, active)` never matches
  `NULL` in SQL. The list omitted it and the detail route answered 404 for a dashboard the same
  user owned. `workspaceScope` now matches `NULL` alongside the active workspace.
- `tokenRefresh`'s global 401 handler consults `PUBLIC_PATHS` (moved to a leaf module so the API
  layer can read it without pulling in the router). On a page a visitor reaches with no session, a
  401 is the expected answer, not an expired session — a stray `getUserUiSettings()` was logging
  shared-dashboard visitors out and hard-navigating them to `/login`. The route announcer skips
  opaque segments, so `/dashboards/shared/:token` no longer titles the tab with a 64-character hex
  string.
- The ERD's `fitToView` measured the host's `clientHeight` — the height the diagram had already
  been scaled into — so an already-fitting diagram shrank to about 97% of itself, and again on
  every click. It derives the budget from the host's computed max-height/min-height, fits once on
  load, and sits in a named, keyboard-reachable scroll region rather than a div only a mouse could
  pan.
- `useUrlFilters` gains `setFilters`. React Router resolves the updater against a snapshot
  refreshed only on render, so two `setFilter` calls in one handler silently cancelled — which is
  why Clear-all buttons left a filter behind.
- The bug triage table filtered client-side over the twenty rows already fetched while the footer
  reported the server's unfiltered total, so it could say "No results." directly above
  "Showing 1-2 of 2".
- `dashboardGrid.css` replaces react-grid-layout's light-theme affordances — a black-on-charcoal
  resize handle hidden until hover, and a `background: red` drop placeholder that read as an error
  — with app tokens, and `WidgetFrame` stops single-value widgets amputating their digits at the
  shortest row heights. `OptionCard`'s selection ring gains `ring-offset-background`, which it
  lacked, so a selected option no longer carries a hard white halo in a dark app.
- Health status drew a coloured `size-4` glyph beside its badge — two marks saying one thing, on
  eleven rows of a surface that otherwise reserves colour for exceptions. The glyph moves inside
  the badge. `healthStatusUtils` drops its `.tsx` extension now that it exports no component; a
  module exporting both loses fast refresh.
- The shared-core checker rejects a group whose `source` and `fallbackSource` are byte-identical.
  It previously kept running and compared every target against a file that no longer distinguished
  anything: the `ensureHistoryGuard` corruption on 2026-08-09 surfaced as 16 DIVERGED-HOOK findings
  filed against the wrong repositories, with nothing in the run naming the manifest as the problem.
- `license-core-adapter-targets.json.example` is tracked, which `assertRosterHygiene` requires of
  every declared roster group. The group was registered without it, so `test:shared-core-write`
  failed 1 of 74 assertions at v3.39.1.
- The crawler answers native dialogs. Puppeteer auto-dismisses them when no listener is attached,
  and dismissing a `beforeunload` prompt means "stay on this page", so once the crawl toggled a
  switch on `/settings/email` every later `page.goto` blocked on the unsaved-changes guard and
  timed out. Seven routes failed that way with no console or network error to explain it. The
  handler accepts `beforeunload` and dismisses anything else after logging it, and it registers in
  `attachPageHandlers`, which both the initial launch and the mid-crawl browser recycle call.

### Documentation

- `bun run check-docs` is corrected to `bun run check:docs` in `docs/README.md`,
  `docs/template/DEVELOPMENT.md`, `docs/template/README.md`, and the usage comment in
  `scripts/check-docs.ts`. The rename shipped in 3.30.0 and these four sites were missed.
- `scripts/smoke.md` drops a `bun run clear-logs` row for a script that does not exist.
- The `docs/template/STACK.md` "Template Version" line is now a checked claim site in
  `check:version-refs`, which brings the gate to six sites. It had sat at v3.29.0 — the same class
  of drift the gate was written for.
- The `docs/template/DEPLOYMENT.md` Compose example no longer pins `spernakit-test:3.21.0`.
- `docs/template/GETTING_STARTED.md` says where the default accounts come from and what a
  production seed does instead. It listed five passwords under "the template ships with these
  accounts", which reads as a shipped default rather than a development seed.
- `docs/template/API_REFERENCE.md` documents the bug intake as its own section: the submit route,
  the ADMIN list route with its `status`, `kind`, and `search` parameters, and the status-update
  route. It had a single unannotated line for `POST /api/v1/bugs`.
- The feature lists in `README.md` and `site/index.html` name the bug and feature-request intake,
  and the site's Identity card names OAuth/SSO, TOTP, and scoped API keys, which it had left out
  while describing the same subsystem.

## [3.39.1] - 2026-08-09

### Fixed

- The leak guard sees a key body added under a PEM header that is already committed. The rule
  walked staged additions, so it could only find a header and a body when one commit added both.
  A body pasted under a header left behind by an earlier commit puts no header in the additions
  set at all, and that is the likeliest way the leak actually happens. The walk now runs over a
  diff carrying one line of context, which makes the adjacency visible while `+` still marks what
  the commit is adding. Inline material is reported only on an added header, because reporting it
  on a committed one would block every later commit to that file with no way to clear it short of
  the bypass. `check:leak-guard` gains a case that commits a bare header and then adds a body
  under it.
- The shared-core roster hygiene check asks git rather than the filesystem. It read
  `existsSync` for "the example roster is tracked here", which an untracked copy sitting in the
  working tree satisfies while shipping nothing, and it searched `.gitignore` for a literal
  `/<roster>` line for "the roster is ignored here", which misses a rule spelled another way, one
  in a nested `.gitignore`, and the global excludes file. Both now run git itself, through
  `ls-files --error-unmatch` and `check-ignore --no-index`. Both understand exit 0 and exit 1 as
  answers and raise on anything else, so a git that is not on PATH, is killed, or rejects a flag
  fails the suite instead of reporting the roster unguarded for a reason unrelated to the roster.
  Two probes run before the roster assertions: one against a directory that does not exist, which
  must raise, and one against a name this repository neither tracks nor ignores, which must answer
  no to both.
- The destructive-confirmation gate no longer reads a confirmation primitive out of a string
  literal. `stripComments` removed comments and deliberately kept string contents, so a dialog
  named in a toast message, in a route path, or in a test's expected text sat in the evidence
  window of an unguarded call and passed it. That is the same fault the comment handling exists to
  close, one layer over: prose that happens to sit inside quotes rather than inside a comment. The
  function is now `codeOnly`, and it blanks the contents of every string while keeping the
  delimiters, so the surrounding line still reads as code. A template's interpolations are the
  exception and are scanned as the code they are, including strings and templates nested inside
  them: `${deleteThing.mutate(id)}` is a call that runs, and dropping it would delete a call site
  rather than weaken the evidence for one.
- Quote state in that scan carries across line boundaries. It was reset at every line, so a
  multiline template's continuation lines were read as code, and a `/*` or a stray quote inside
  template text opened a comment or a string that swallowed the code after it. Only the backtick
  survives a line boundary now; a single or double quote left open is closed at the end of its
  line, since neither can legally span one.
- The evidence resolver resolves a `useCallback` handler whose parameter list Prettier wrapped to
  the next line. It required the `(` on the declaration line, so a declaration ending at
  `useCallback(` with `async (id) => {` underneath resolved to nothing and the gate reported
  a confirmed site as unconfirmed. Whether a handler resolved depended on how long its arguments
  happened to be. The wrapper still has to be `useCallback` by name: accepting any wrapping call
  reintroduces the misresolution recorded against `UsersTab.tsx:79`.

## [3.39.0] - 2026-08-09

### Added

- `test:destructive-comments`, which covers the comment stripper the confirmation gate now reads
  through. Eleven unit cases over the stripper, then five cases running the real gate against a
  fixture tree and asserting both the exit code and the printed text, one per fault below plus a
  control. The fixtures cannot live under `frontend/src`, because a file holding a deliberately
  unconfirmed delete is indistinguishable, to the gate, from the defect it exists to find. The
  pre-fix gate fails seven of the ten gate assertions.
- `test:destructive-evidence`, which exercises the real evidence resolver against fixtures it
  builds rather than against repository files, so no source file has to hold a particular shape
  just to be measured. It is wired into qc ahead of the gate it backs and carries both resolver
  defects below: 21 assertions, eight of which fail against the previous pattern and two against
  the broader one that would have replaced it.

### Fixed

- A scaffolded project can make its first commit. `bun scripts/init.ts` ended on `git add -A`
  followed by `git commit`, and the leak guard blocked that commit on fourteen PEM header
  constants across five template files. The guard scans staged additions only, so content
  committed before the guard existed never fires again, and a fresh init is the one case that
  stages every template file at once. Those headers had been legal for months: a config validator
  compares an incoming key against the header, and the deployment and security documents show the
  shape a key takes, so the header on its own says a key goes here rather than a key is here. The
  rule now requires the key material as well, either base64 following the header on the same line,
  which is how a one-line JSON or `.env` value carries a whole key, or an added line of nothing but
  base64, which is how a pasted body looks. A placeholder remainder matches neither. It is written
  in grep and sed rather than awk because CI runs on Ubuntu, whose mawk has no interval support.
  The guard's self-test trades its single PEM case for four: a bare header passes, a pasted body
  blocks, a one-line key blocks, and a documentation placeholder passes.
- The initializer runs its quality gate inside a populated repository. `git init`, the hooks-path
  configuration and `git add -A` all ran after `smoke:qc`, and several gates ask git what the app
  contains. `enumerateInitFiles` shells `git ls-files`, which reads the index, so an unstaged tree
  answers with nothing and `test:critical-path-budget` fails on an empty file set. Running the gate
  outside a repository is worse, since every answer then comes from whatever repository sits above
  the target or from none at all. Formatting still lands before staging, so the index holds the
  text the gate grades and the commit records exactly that. The drift suite pins
  `DRIFT_BRANDED_ADVISORY` off for its own cases, because init runs it under a `smoke:qc` that sets
  the variable and `runCli` inherits the real environment, so the case that must fail on a deleted
  build instruction passed as advisory.
- Setup deletes a task by what it points at rather than by name. The fresh-release pair was removed
  from a new app's `package.json` by name, and when the shared-core group was withheld from init,
  its three tasks kept shipping and no longer resolved, so `check:script-targets` failed in every
  new app. Setup runs after the copy, so the tree itself answers which files arrived, and any task
  naming a file the app did not receive is now dropped. The parse comes from
  `check-script-targets.ts` rather than a second weaker copy, since the question is the one that
  gate already answers.
- `scripts/bundle-budget.json` records the new app's slug. The budget carries the slug its numbers
  were measured for, and the gate refuses to enforce a budget belonging to another app, so a copy
  still stamped `spernakit` left every derived app's bundle unmeasured until someone regenerated
  it. The critical-path budget beside it carries no slug by design and is deliberately left alone.
- The confirmation gate reads code rather than prose. It scanned raw file lines, so a comment
  counted as evidence, and four faults followed from that. A comment naming a primitive satisfied
  the evidence window, so `// TODO: wrap this in a ConfirmAlertDialog` inside a handler passed the
  call on the note saying it was unguarded. A waiver's own reason counted as evidence for the site
  it waived, which resolved the window, left the marker unclaimed, and reported the waiver stale;
  both real waivers in the fleet passed only because their wording happened to avoid the pattern.
  A waiver marker's own line was examined as a candidate site. And a commented-out dispatch such
  as `// deleteThing.mutate(id)` was counted as a call site. The gate now reads sites and evidence
  from stripped text while reading waivers from the raw lines, which are not interchangeable: a
  waiver lives in a comment by definition. The stripper is a single-pass scanner that tracks
  strings, so a marker inside a literal survives. It is deliberately inexact on JSX text
  containing `//`, and the bias is asserted rather than left implicit, because dropping real
  evidence produces a finding a reader can see and waive while keeping prose produces a pass
  nobody sees.
- The evidence resolver resolves a `useCallback`-wrapped handler. Its const form required the
  parameter list to follow the `=` directly, so a handler written as
  `useCallback(() => {...}, [deps])` returned null and lost the handler hop entirely, reporting
  the site unconfirmed with an `onConfirm={handleDelete}` sitting in the same file. The wrapper is
  matched by name rather than by accepting any call before the parameter list: the broad form
  matched `const ids = selectedRows.map((u) => u.id)`, which sits at the same depth as the
  statement under it, so the indentation test read it as a closed sibling and stopped resolving a
  `function handleBulkDelete()` two lines above.
- `config/example.json` is branded during setup and visible to drift detection. The template
  manifest has classified it as branded for as long as the manifest has existed and nothing ever
  checked it: `config/` sat in the drift-excluded directories, so exclusion returned true before
  classification ran, and setup wrote `config/<slug>.json` and `backend/src/config/defaults.json`
  from two separate call sites while missing the third tracked config. Ten of the eleven derived
  apps carry an example config still declaring slug `spernakit`, the `spernakit_auth` /
  `spernakit_csrf` / `spernakit_refresh` cookies, and `file:./data/spernakit.db`. That is the only
  tracked config a fresh clone has, since the live one is gitignored, and cookies are not
  port-scoped, so two apps started that way on one machine share a session cookie namespace.
  `config-writer.ts` now applies one `applyBranding` to all three tracked configs from a single
  place; secrets stay out of it, since the tracked files must hold the
  `PRODUCTION_CHANGE_REQUIRED` placeholders and only the untracked instance config receives
  generated keys. The directory exclusion is dropped for `config/config-schema.json` alone, which
  is generated per app and already has its own gate. The example-config comparison substitutes
  only each side's own declared branding and replaces a field only where it already holds that
  value, so an unbranded file survives into the comparison instead of normalizing to the same text
  as a branded one.
- The initializer no longer ships shared-core rosters to apps that cannot read one. The init
  exclusion named `shared-core-targets.json` literally, and when the license-core sync generalized
  into `sync-shared-core.ts` and one group became four, the pattern did not move.
  `gate-conventions-targets.json.example`, `portable-gates-targets.json.example` and
  `shared-core-sync-targets.json.example` have shipped to every derived app since, and nothing in
  an app can act on them: the only reader of a roster is withheld from init, and the one entry
  point that does ship refuses on ownership before it would resolve one. The exclusion is now a
  pattern over the roster naming convention, and `assertRosterHygiene` reads the real manifest and
  requires, for every owned roster group, that the roster and its example are both withheld from
  init, that the example is tracked here, and that the roster is gitignored here, so a fifth group
  fails the self-test instead of shipping. `scaffolding/.gitignore` gains the roster rule for the
  reason `/spernakit.psd1` is already in it: a roster names private sibling repositories, and a
  file that should never exist in an app must not become a tracked one if it ever does.
- `check:deps` requires the shared workspace package in both critical dependency lists. The check
  exists to catch an accidentally removed dependency and omitted the one whose absence breaks the
  schema layer. An app ran for two days with the shared package gone from `backend/package.json`
  and every gate green, because an earlier install had left a resolvable link in `node_modules`,
  and only wiping the tree exposed it. The name is read from `shared/package.json` rather than
  written down, since that file is branded and a literal would fail an app that renamed it
  correctly.

### Upgrade notes

Both new gates run as part of `smoke:qc`, taking the qc step count from 60 to 62.

Two of these repairs land as findings on first upgrade rather than as silent fixes. An app whose
`config/example.json` still carries template branding will fail `check:drift` on that path until
the file is branded; an app whose example config carries its own app-specific sections needs a
`.templateoverrides` entry instead. And the three roster example files remain tracked until each
app removes them, which is a `git rm` per app; drift detection stays quiet about them, since an
init exclusion is also a drift exclusion.

## [3.38.1] - 2026-08-08

### Fixed

- The override-delta report no longer recommends deleting an override that is doing its job. An
  entry whose app copy carries every line the target version has and adds more was reported as
  withholding nothing and safe to delete, which is the opposite of the correct action: deleting one
  makes drift detection report that path on every run from then on, which is the noise the entry
  was written to suppress. Those entries now report separately as adds-only, with their app-only
  line count, and the deletion advice is limited to entries whose two copies agree line for line.
  The first derived-app upgrade to read this report was handed 21 entries under the wrong heading.
- The initializer no longer expects a derived app to carry `scripts/lib/shared-core-write/`. That
  directory holds the fixture and invariant library for the owner-side peer-sync self-test and
  imports `scripts/lib/shared-core/`, which 3.38.0 already excluded. Leaving the write helpers off
  the same list made drift detection report three missing files in every derived app.

## [3.38.0] - 2026-08-08

### Added

- `scripts/sync-shared-core.ts` and `scripts/shared-core-manifest.json`, one manifest describing
  every file this fleet shares between peer repositories. It replaces three hand-written installers
  whose file lists were each restated somewhere different, and it carries a `--check` mode wired
  into `smoke:qc` as `check:shared-core` plus a `--write` path with `--dry-run`, `--only` and a
  repeatable `--group`. Absent and different are separate findings: a file missing from a target is
  a rollout the write path has not reached, a file present and different is a repository running a
  stale guard while reporting as covered, and only drift exits non-zero. The writer takes its whole
  worklist from the findings the checker already produced and can reach a file only through the two
  classifications that name a real source and destination pair, so a foreign hook, a
  hand-maintained local chain, a repository whose hook dispatcher is not ours, and a guard that
  dispatcher never invokes are all unwritable by construction rather than by a second copy of the
  rules. Ownership is declared per group and `--write` refuses a group the running repository does
  not own; `--check` verifies every group from anywhere. A target with uncommitted changes at the
  path is refused, and a git failure counts as a refusal rather than a pass.
  `scripts/test-shared-core-write.ts` builds a synthetic fleet of real `git init` repositories and
  asserts 22 properties across classification, dry-run fidelity, every refusal, and idempotence.
- `check:gate-conventions`, a meta-gate over the repository's own gates, with the eight rules
  written out in `docs/reference/gate-conventions.md`. Six of the eight are enforced statically:
  an exported `run*` entry point behind an `import.meta.main` guard, exit codes limited to 0, 1
  and 2, an `[OK]`/`[FAIL]`/`[WARN]`/`[SKIP]` marker with no pictographs, `parseArgs` with
  `strict: true` from `node:util` in place of a hand-rolled argv scan, an `Enforces:` line naming
  the rule, and `--json` output carrying `examined`, `findings`, `gate` and `status`. The allowlist
  can only shrink, because a waived path whose rule now passes is itself a finding. A gate joins
  the population either by carrying a `check*` task name or through a reasoned entry in the
  allowlist's `gates` map, so a gate-shaped task outside the naming convention is examined rather
  than skipped.
- `check:script-targets`, which resolves every script file named by a `package.json` task and fails
  when one does not exist. A task name and the file behind it reach a derived application on
  different mechanisms, since `package.json` is branded and script files are template-managed, so
  an application that receives one half of a rename without the other is broken rather than stale.
- `check:env-spread` (ASSERT-038), which reports a child process handed the parent environment
  wholesale. `scripts/lib/third-party-licenses/image-inventory.ts` is narrowed to the keys the
  docker CLI documents for locating its daemon and config; six remaining sites spawn dev servers,
  git hooks, or the CLI under test and carry a marker with a stated reason.
- `check:audit-artifact-hygiene`, which refuses an audit report claiming a date later than today in
  its filename, its first heading, or a `Date:` field.
- `.no-fleet-sync`, a tracked file by which a repository declines the shared-core sync with a
  reason. It is honored only while the repository has no push remote, so it can never exempt
  anything that could publish, and `git remote add` re-arms every group.
- `.screenshot-capture`, a tracked declaration that a repository captures release screenshots.
  `screenshot-guard.sh` previously decided this by testing for a `screenshots/` directory, which is
  gitignored, so the predicate answered from untracked local state and read as opted out in a fresh
  clone. The file ships from the template root so a scaffolded app is born with it.
- The data table's select column. Row selection was wired end to end except for the control that
  selects a row, so Settings > Users and Notifications rendered a permanent "0 of N row(s)
  selected." footer and their bulk delete and bulk role-change paths could not be reached.
  `createSelectColumn()` returns the column and the two column hooks prepend it behind an
  `enableSelection` prop, so tables that do not select keep their existing column sets.
- `findMissingRequiredPaths` reports schema-required fields omitted from a standalone config file
  before defaults are applied, so a required value has to be supplied rather than silently
  defaulted. `config/example.json` gains `busyTimeoutMs`, `ssl` and `databaseAdmin`.
- A `postinstall` hook running `scripts/postinstall.ts`, which regenerates
  `THIRD_PARTY_LICENSES.md` and `THIRD_PARTY_NOTICES.md`. Both are derived from the lockfile, so a
  dependency bump makes them stale as soon as `bun.lock` is written, and until now the only thing
  that noticed was `check:licenses` during the next `smoke:qc`. It is skipped when `CI` is set,
  because that gate is the same generator in `--check` mode and CI installs before it runs qc:
  regenerating there would rewrite the artifact immediately before the gate compared against it, so
  a stale committed document would pass every CI run and fail only on a developer machine. The hook
  never fails the install; a generator that cannot read the lockfile warns and lets `bun install`
  finish. It is skipped a second way, for the Docker build: `Dockerfile` installs against a partial
  tree holding only the workspace manifests, and bun resolves a postinstall entry file before it
  runs, so the file itself has to be copied into that layer. It is, next to `require-bun.ts`, and it
  detects the absent generator and returns without importing it. **Derived apps take all three
  parts: the `postinstall` key in `package.json`, `scripts/postinstall.ts`, and the `Dockerfile`
  COPY line.** An app that takes the key without the COPY line fails `bun run docker:build`.

### Changed

- Four gates are now named after the task that runs them: `check:api-types` runs
  `check-api-types.ts`, `check-deps` runs `check-deps.ts`, and `check:override-deltas` runs
  `check-override-deltas.ts`. The files were renamed and the task names left alone, because a task
  name is the external surface while a filename is named only by this repository's own plumbing.
  Four end-to-end tests move the other way, since they wore `check` names while gating nothing and
  need a running server: `check-auth-reset-api`, `check-auth-reset-ui-dev`,
  `check-auth-reset-ui-preview` and `check-lockout-refresh` are now `test:*`, and
  `test-lockout-refresh-decouple.ts` drops its suffix. `verify-mutation-denylist` becomes
  `test:mutation-denylist` running `scripts/test-mutation-denylist.ts` for the same reason: it
  exercises a runtime guard against fixtures it assembles itself rather than asserting anything
  about the repository. **Derived apps take both halves of these renames in one pass.** The files
  arrive through drift detection and the task names do not, so an app that copies the files without
  editing its own `package.json` fails `check:script-targets`, and in the case of
  `test:mutation-denylist` fails its own `smoke:qc`, because that step is an ordinary qc step
  rather than `templateOnly`.
- `sync-license-core.ts` is now a delegate to `sync-shared-core.ts` rather than its own
  implementation, and the roster file is renamed `license-core-targets.json` to
  `shared-core-targets.json` since it no longer describes license-core targets alone. The
  `licenses:sync-core:check` qc step is retired in favor of `check:shared-core`.
- `check-docs` is renamed `check:docs`, takes a project root so a delivered copy can be pointed at
  another tree, states how many markdown files it examined on both verdict lines, and fails when it
  finds none. Gitignored files are dropped in one batched `git check-ignore --stdin` call rather
  than one spawn per directory, which took the largest carrier from nine seconds to under a fifth
  of a second.
- `check:destructive-confirmation` looks at the dispatch layer. Both carriers moved their requests
  behind a typed API client, so the DELETE lives in `frontend/src/api/` and only the dispatch
  remains in the component; the old patterns matched zero lines while eight real destructive
  dispatches sat in the repository. A confirmation primitive that names the handler holding the
  call now counts as evidence, one level deep. The `@no-confirm-required` marker is replaced by
  `destructive-confirmation-allow: <reason>`, and a marker with no reason, or one that has outlived
  the finding it covered, is itself a failure.
- `check-schema-parity.ts` is split into `scripts/lib/schema-parity/`, so its parsing and
  comparisons can be exercised without a schema tree on disk. Behavior and message order are
  unchanged. `test-backup-compression.ts` imports `MAX_COMPRESSION_RATIO` and
  `MAX_DECOMPRESSED_SIZE` from the service instead of restating them under a comment saying they
  mirrored it.
- `check:git-window-hide` and `check:no-inline-references` take a project root and ship through the
  shared-core sync. The first had drifted to a different scan-root list than aidd's
  re-implementation of the same rule, and the gap between them was a whole top-level directory
  holding a real unhidden spawn. The second hardcoded two absolute schema directories and crashed
  on a carrier that had only one of them.
- The repository root is linted. `lint` covered the three workspaces and `scripts/` but never the
  root, so `eslint.config.js` was an input to a cache entry for a step that never read it. A
  `lint:config` peer of `lint:scripts` is chained into `lint`, `lint:fast` and `lint:fix`, and runs
  with `--report-unused-disable-directives`.
- `docs/template/TESTING.md` points at `scripts/smoke.md` instead of listing the qc pipeline by
  hand. The hand-written list had drifted to 8 entries against the steps the mode actually runs;
  the generated runbook is guarded by `check:smoke-docs` inside qc.
- Frontend and backend dependencies updated: vite to v8.2.1, nodemailer to v9.0.5, pg to v8.23.0,
  `@types/pg` to v8.21.0, `lucide-react` to v1.30.0, `@types/node` to v26.2.0, eslint to v10.8.1
  and `eslint-plugin-jsdoc` to v64.0.1. `@tanstack/react-table` stays on the 8 line: the v9
  rearchitecture renames every row model and reshapes every generic around a leading `TFeatures`
  parameter, which breaks all eleven consumers under `frontend/src`.

### Fixed

- `waiverReason` in `scripts/lib/docs/waivers.ts` strips `--!>` as well as `-->`. Both close an
  HTML comment, so a waiver written with the first kept its terminator in the reason text. CodeQL
  reports the old pattern as `js/bad-tag-filter` at high severity; nothing here filters untrusted
  HTML, so the practical effect was the reason string, not a vulnerability.
- The API error handler answers `/api/v1` failures. The root handler in `app.ts` was registered
  before `.use(apiApp)`, and an Elysia error handler swallows errors from every plugin mounted
  after it, so request-body validation failures came back as 500 `SERVER_INTERNAL_ERROR` with no
  `requestId` and an ERROR-level log line instead of 400 `VALIDATION_FAILED` at DEBUG. The root
  handler now sits after the API chain and still ahead of the root's own routes.
- Widget width and height are validated before submit. `AddWidgetDialog` checked the title and
  nothing else, and because Add Widget is a button click rather than a form submit the browser
  never enforced the inputs' `min` and `max`, so an out-of-range value came back as a toast naming
  no field. The bounds live in `widgetSize.ts` and mirror the backend schema. Height keeps no
  client-side maximum because the server imposes none.
- Three selection defects that only appeared once a row could be selected: two toggles in one tick
  both read the same value through the render closure and under-counted, a successful bulk action
  left the checkboxes checked while the bulk bar no longer offered those rows, and the loading
  skeleton unmounted the table on any query-key change so a page-size change discarded the
  selection outright.
- Six gates that could report a pass having examined nothing. `check:shared-core` printed no drift
  with no peer checked out, which is legitimate in CI and is now a `[SKIP]` with its reason, while
  an `--only` matching no target is now a failure. `check:secrets-shape` has printed `[OK] No
secrets files found` on every run it ever made, because the split-secrets pattern belongs to the
  derived apps, and now prints `[SKIP]`. `check:env-spread`, `check:git-window-hide`,
  `check:no-inline-references` and `check:docs` each skipped every absent scan root and printed
  `[OK]` over zero files. `check:image-publication` asserts an absence, so a renamed
  `.github/workflows` made every pattern go unchecked and produced the same verdict as a clean
  scan. Eight gates now state how many items they examined on their success line, which
  `check:gate-conventions` enforces.
- `check:max-lines` scanned `cli/src`, a workspace this template does not ship. A missing root is
  skipped silently rather than failing, so the entry read as coverage while scanning nothing, here
  and in every derived app. `fast-subset` and `verify-minification` no longer justify a decision by
  citing measurements from a peer repository that nothing here can verify.
- The shared-core sync's wiring check compared a target's `package.json` script against the
  canonical command with `!==`, so a target that composed the required invocation into a longer
  script reported identically to one that had wired nothing. Wiring values are substrings the
  script must contain, each naming the load-bearing invocation alone.
- The shared-core sync discovered leak-guard targets by the `.aidd` marker, which is the history
  guard's sweep rather than the leak guard's, and so reported thirty-two repositories current when
  the installer it replaced had covered fifty-one. The marker is now optional and each group copies
  the answer from the installer it replaced.
- A repository seeded before a group's marker described it stopped receiving updates to files it
  already holds, and two sat two weeks behind on `screenshot-guard.sh` while the group reported
  full coverage. Discovery takes the union of the marker and already carrying every one of the
  group's files, which widens maintenance without widening adoption.
- Two dead entries in `eslint.config.js`: `artifacts/**` names a directory this repository has
  never had, and `**/tailwind.config.js` names a file Tailwind v4 does not use.
- Desktop design sweep remediations and database admin desktop refinements.

## [3.37.0] - 2026-08-05

### Fixed

- Platform gating is inherited across dependency edges when the runtime license closure is walked.
  A package that declares no `os`, `cpu`, or `libc` constraint of its own can still be unreachable
  on every ordinary install, because the only paths to it run through parents that are gated.
  `@img/sharp-wasm32` is reached only through `@img/sharp-freebsd-wasm32` and
  `@img/sharp-webcontainers-wasm32`, and reading its own entry alone called it, and its dependency
  `@emnapi/runtime`, missing installs. Gating is now carried along each edge, and an unrestricted
  arrival at a package overwrites a gated one, so the result does not depend on which edge the
  traversal happened to walk first. Only that downgrade re-enqueues a key, so the walk still
  terminates.
- `bun run check:image-licenses` no longer fails a package that ships no license file when the
  image already carries the text of the license it declares. sharp's prebuilt libvips binaries
  publish their terms in the `license` field of `package.json` rather than as a file, and the image
  ships the full text of every GPL and LGPL variant under `/app/licenses`, so the manifest names
  the terms and the artifact supplies them. A package whose terms reach the image nowhere at all
  still fails, and the declared identifier is read as a whole so a compound expression cannot pass
  by matching one of its halves.

### Removed

- `scripts/test-vendored-browser-gates.ts` and the qc step that ran it. The gate existed so the
  template stayed safe for an app that vendored the separately maintained browser tool into
  `scripts/spernakit-browser/`, and it asserted against a synthetic fixture rather than against any
  real vendored tree. The tool moved to its own project and the four apps that carried a copy have
  deleted it, so the accommodation now guards nothing. The Knip entry for the workspace root drops
  its browser arm and reads `scripts/*.ts`, and `docs/template/DEVELOPMENT.md` no longer describes
  the standalone-project layout. Derived apps still carrying `scripts/test-vendored-browser-gates.ts`
  should delete it; the drift checker reports it as a retained deletion.

## [3.36.0] - 2026-08-05

### Added

- `scripts/lib/third-party-licenses/image-inventory.ts` holds the parts of the image license check
  that need a docker daemon and a built image: running a script inside the image, reading its apk
  database and bun store, and rendering the base-package inventory. The rest of that directory
  answers questions about the lockfile and the development tree and runs in `smoke:qc`; these
  answer questions about the artifact and run only in the docker smoke modes.
- The runtime license closure records which packages the lockfile gates to a platform. A gated
  package that is not installed here is named in a new "Packages built for another platform"
  section of `THIRD_PARTY_NOTICES.md` rather than failing the generator, and
  `bun run check:image-licenses` confirms each one carries its own license file inside the image,
  which is the only artifact that ships it. The gate is presence of an `os`, `cpu`, or `libc`
  constraint rather than whether it matches this host: bun records `os` and `cpu` but not `libc`,
  so a musl build and a glibc build are indistinguishable in the lockfile, and evaluating the
  constraint would call one of them installable on a Linux runner that will never install it.

### Fixed

- `/assets/` returned 403 instead of the application. The SPA fallback resolved `$uri/` before
  falling through, so any route whose name matches a real directory in `dist` resolved to that
  directory, and with `autoindex off` and no index file inside it nginx answered 403. The `$uri/`
  term is gone, an exact-match `location = /assets/` settles the one case that collides with the
  build-output prefix, and the static-file location now falls through to a named `@spa` location
  instead of dead-ending. Response headers are repeated per location because nginx does not
  inherit `add_header` into a block that sets any of its own, and the CSP is hoisted into a
  `map` so the two copies cannot drift.
- Workspace `optionalDependencies` are seeded as roots of the runtime license closure. An optional
  dependency that installs is distributed like any other, so a native image processor lands in the
  container carrying the same attribution obligation as a required package. Omitting the field left
  those packages out of the notices entirely; the image check caught it and the npm-only checks
  could not. No workspace in the template declares `optionalDependencies`, so the generated
  documents here are unchanged.
- `bun run licenses:image` writes the base-image inventory before asserting npm coverage rather
  than after, so the inventory can be refreshed while a coverage gap is open, including a gap whose
  repair is regenerating that very file. The assertion still runs on the way out, so `--update`
  cannot pass a check it should fail.

### Changed

- `scripts/tsconfig.json` includes `**/*.ts` rather than `*.ts`. The top-level scripts seed the
  program and tsc follows their imports, so `lib/` was already covered; the widening adds only
  what no script imports, such as a vendored subtree or a helper reached at runtime. That is the
  code most worth checking, because nothing else looks at it. Measured on the template it is a
  no-op: 198 files and zero errors either way. Derived apps that carry a vendored tree under
  `scripts/` should drop their `.templateoverrides` SKIP for this file.

## [3.35.0] - 2026-08-04

### Added

- `scaffolding/.githooks/` carries `leak-guard.sh`, `leak-guard-setup.sh`, and the current
  `pre-commit`, so a freshly initialized app is born with the commit-time secret guard wired. The
  initializer had been copying a hook that chains `.githooks/leak-guard.sh` without copying the
  guard itself, and that hook was two generations behind the root one: it still enumerated
  `format:check`, `lint`, `typecheck`, and `check:max-lines` inline instead of delegating to
  `smoke:qc:fast`, and it had no license check. Every app scaffolded since the guard landed got a
  hook naming a file it did not have.
- `bun run check:git-window-hide` fails when a direct git subprocess spawn omits
  `windowsHide: true`. Without the flag each spawn flashes a console window on Windows, which reads
  as a crash in a packaged app. The flag does nothing on other platforms, so it is applied
  unconditionally rather than behind a platform test. The existing spawns were fixed in the same
  change.

### Changed

- The leak guard drops the tier-2 patterns that match the repository's own directory name before
  scanning, and keeps the rest. The pattern file is per-machine rather than per-repo, so it names
  every private sibling including the one being committed to. Measured against a real pattern file,
  8 of 11 derived apps had their own name flagged, so installing the guard there would have blocked
  ordinary commits. A repository cannot leak its identity to itself, since the name is already its
  directory, its remote URL, and its package name, while its siblings' names stay guarded. A
  pattern that grep cannot compile is kept rather than dropped, so the filter fails closed. This
  reverses the 3.23.0 decision to keep the guard out of derived apps, which existed only because of
  that failure mode.
- The leak-guard self-test runs in every derived app rather than the template alone. Its smoke step
  lost `templateOnly` and `scripts/check-leak-guard.sh` left the drift-exclusion list, so an app's
  copy of the test now has to stay in step with its copy of the hook instead of rotting at whatever
  version it was scaffolded from.
- `bun run test:scaffolded-hooks` covers the commit-time chain end to end, and reads the guard list
  out of the hook text instead of a list of its own. A guard added to a hook without a matching
  scaffold copy now fails there rather than shipping silently. The fixture moved into
  `scripts/lib/scaffolded-hooks/` to stay under the 300-line file cap.

### Fixed

- `check:leak-guard` and the `prepare` hook no longer invoke a bare `bash`. On Windows the
  System32 `bash.exe` is the WSL launcher, and it shadows Git's bash for every process whose PATH
  does not already prepend Git's `usr/bin`, which is every PowerShell and cmd session. With no WSL
  distribution installed, both `bun install` and `smoke:qc` died on a relay error naming neither
  the script nor the shell it wanted. `scripts/run-bash.ts` resolves the interpreter explicitly,
  preferring the bash that ships beside the running git and never the System32 launcher.
  `check:config` now rejects a bare `bash` in any package script.

## [3.34.0] - 2026-08-03

### Added

- `bun run check:version-refs` fails when the template's current-state version claims disagree with
  `package.json`. The README title and its two baseline sentences had sat at v3.29.0 across seven
  releases, because `release:notes` writes the changelog and nothing watched the prose around it.
  Support floors, historical prose, and provenance stamps are left alone, since those stay correct
  while frozen. The gate runs in the template only: derived apps keep branded READMEs behind a
  `KEEP README.md` override, so the sentences it matches do not exist there.

### Changed

- `@typescript-eslint/unbound-method` is enforced for shared, backend, and scripts, not the frontend
  alone. A method passed as a bare value fails lint now rather than losing its receiver at runtime.
  The one real site is the deliberate native setter detach in `scripts/crawltest-bugreport.ts`,
  which supplies its own receiver and carries a scoped disable.
- `bun run smoke:qc:fast` lints through a new `lint:fast` that passes ESLint's `--cache`, while the
  full `smoke:qc` keeps running the uncached `lint`. That cache keys on each file's own content,
  which the type-aware rules outlive: a type change in one file can create a violation in another
  that the cache then treats as unchanged and skips. The fast variant records under its own smoke
  cache key as well, so a fast pass can never let the full gate skip its uncached lint.
- The shared leak guard counts `starsync` as a public repository name alongside `aidd` and
  `spernakit`, and no longer counts `aidd-web`. The four shared hook files are kept byte-identical
  across three repositories now rather than two.

### Fixed

- The screenshot push guard no longer fails a version-tag push in a repository that never captures
  screenshots. A missing `screenshots/` directory means the repository does not capture at all, and
  a tag with no capture under an existing directory still fails. Scaffolded apps receive the
  corrected guard: their copy had drifted from the template's and was still failing the opted-out
  case.
- The license inventory finds packages nested under a scope directory. `@octokit/` is a directory of
  packages rather than a package, so a nested copy at
  `node_modules/@octokit/endpoint/node_modules/@octokit/types` was unreachable, and a hoisted
  install that kept a second version there reported the package as not installed at all.

## [3.33.0] - 2026-07-28

### Added

- Derived apps can now synchronize template-owned `.aidd/features` records while preserving
  app-owned priority, release, and run state. The sync refuses overwrites that would discard
  app-authored feature text unless the operator explicitly allows them.
- New quality gates verify that feature IDs match their directories and that each derived app has
  the current template feature corpus. Project initialization seeds the same corpus before its
  first quality check and commit.

## [3.32.1] - 2026-07-28

### Fixed

- Template drift now distinguishes build-critical branded files and prints the missing structural
  lines, so a derived-app Dockerfile cannot lose a required build instruction behind an ordinary
  branding difference.
- Docker production checks reject placeholder secrets before building an image. Readiness failures
  now report the stopped container's exit code and a bounded log tail instead of ending with only a
  timeout.
- Quality gates now find exported Elysia route modules that are not reachable from the API
  assembly, including flat files and children of unmounted barrels. Package reset also checks the
  frozen lockfile before removing installed dependencies.
- The template verifies that every template-owned feature has an introduction-version marker.
  Freshly scaffolded apps now receive the screenshot pre-push guard and its two-guard wrapper
  together.
- Copied `spernakit-browser` tools keep their separately spawned daemon visible to Knip while
  remaining subject to the same 300-line source limit as the rest of the repository.

## [3.32.0] - 2026-07-28

### Added

- `bun run check:override-deltas -- --target-version <version>` reads every `.templateoverrides`
  entry and prints the lines the target template version has that the app does not, beside the
  reason the entry's author recorded. A `SKIP` or `KEEP` tells drift detection to stop asking about
  a path, so from that point the template's own later changes to the file were invisible and every
  gate stayed green. Entries that withhold nothing are named as obsolete, and an entry that cannot
  be compared exits non-zero regardless of flags.
- `bun run audit:lost-lines -- --app-dir <path>` checks an upgrade commit for app-authored lines
  the template copy deleted. Drift detection asks whether the app still matches what the template
  ships; this asks the inverse question an upgrade actually raises. A dropped navigation entry
  typechecks, lints, builds, and serves, so one derived app lost twenty of them during the
  2026-07-27 upgrade round with nothing to show for it. Lines that some template revision once
  shipped are the stale content the upgrade exists to replace, so only lines no revision ever had
  are reported.
- `bun run check:drift -- --target-version <version>` now reports files the template removed that a
  derived app still carries, and Template Upgrade runs it as step 3, ahead of the copy pass. A path
  the template dropped simply stopped being enumerated, so an app carrying the dead module looked
  clean through every upgrade. `.templateoverrides`' `DELETED` action existed but was only ever a
  declaration an operator wrote by hand; it now suppresses a detected path and prints its recorded
  reason. `docs/template/DEVELOPMENT.md` gained a Retained Template Deletions section.
- `bun run fleet-manifest:sync` restates every `spernakit.psd1` entry from the app's tracked
  `package.json` and its runtime `config/<slug>.json`, rewriting only the scalar values that moved.
  It refuses the whole write when any app directory is missing, any `package.json` is unreadable,
  or any entry has no config file to verify it against.
- `bun run check:aidd-format` and `bun run format:aidd` format-check `.aidd/` metadata. Both
  `.prettierignore` and, since Prettier 3, `.gitignore` are default ignore paths, and both exclude
  `/.aidd/`, so a targeted `prettier --check` at that glob matched zero files and reported success.
  Derived apps track `.aidd`, so unformatted metadata reached their history and every later diff on
  it was churn. The gate skips when `.aidd` is absent or the root `.gitignore` excludes it, and
  fails rather than passes when it enumerates nothing.

### Changed

- `scripts/bundle-budget.json` and `scripts/critical-path-budget.json` are app-owned generated
  state rather than template files. Both are excluded from drift detection and both stay in the
  init copy set, so a new app still starts from the template's committed numbers. The bundle budget
  now records the app slug it was measured from and is enforced only when that slug matches the
  running app, skipping with a regenerate instruction otherwise. The critical-path budget carries
  no slug and is enforced everywhere.
- Crawl login credentials resolve from the seeded account instead of
  `backend/src/config/defaults.json`. That file is tracked, so it could never hold a real
  credential and had always shipped `testing.crawlLoginEmail` and `testing.crawlLoginPassword`
  blank; every derived app hand-filled them and two pinned the whole file as an override to keep
  doing so. The seed and the crawl now read the same named lookup, and production is excluded on
  both ends because a production seed gives that account a random password. The anonymous-crawl
  fallback is gone: an unauthenticated crawl does not fail loudly, it reports a shallow public site
  that reads as a successful run. An unresolvable login exits 1 naming each unset key, before the
  screenshot directory is stamped or a browser launched.
- `bun run check:fleet-manifest` names its authoritative sources and the repair command when it
  fails.
- `bun run smoke:qc` picked up gates for backup compression, both budget files, crawl credentials,
  fleet manifest sync, lost lines, override deltas, retained template deletions, and `.aidd`
  formatting.

### Fixed

- Backup decompression removes its partial output on every failure path before rethrowing. The
  streaming zip-bomb guard aborts mid-stream, so the bytes that had already passed it were on disk
  and nothing downstream knew the path. Restore preparation now registers each temporary path
  before awaiting the operation that writes it, for decryption as well as decompression.
- `bun run check:critical-path -- --update-budget` recalculates the gzip limit alongside the brotli
  one, with the same headroom, instead of writing only brotli and carrying the old gzip ceiling
  forward. That had left the gzip leg unregenerable. A budget file recording only one limit now
  fails with a regenerate instruction rather than comparing against an undefined value.
- The pre-push screenshot guard judges a capture by the crawl's own verdict rather than by how many
  PNGs landed, since a crawl that failed on its last page left a directory that looked complete.
  The crawl stamps `crawl-result.json` before it begins and again when the report lands. A capture
  with no such file still falls back to the PNG count, so directories from earlier releases keep
  working.
- A mistyped `--target-version` on `bun run check:drift` fails instead of exiting 0. It routed
  through the skip path, and because a skip aborts the whole run, one typo also suppressed the
  ordinary drift verdict, during the upgrade where drift matters most. The recorded
  `spernakit_version` tag is an environmental precondition and still skips.
- The crawler counts `net::ERR_BLOCKED_BY_CLIENT` as a client-cancelled request alongside
  `net::ERR_ABORTED`. Neither reached a server, so neither is a network error.

## [3.31.2] - 2026-07-27

### Fixed

- `setup` can now be re-run on an initialized project. It consumed
  `licenses/SOURCE-OFFER.template.md` and deleted it, so every later run — including every
  `reset.ps1` — threw `ENOENT` on the missing template. Once `licenses/SOURCE-OFFER.md` exists it
  belongs to the project owner, who may have filled in the legal entity and contact address, so
  setup now leaves it untouched rather than regenerating it.

## [3.31.1] - 2026-07-27

### Fixed

- Derived apps now ignore `.aidd/skills/`. The directory is materialized by the aidd runtime, so
  every derived app had added the rule by hand and then reported it as template drift forever.

## [3.31.0] - 2026-07-26

### Added

- Added a shared fleet-manifest loader, regression tests, and a PowerShell reader. Reset,
  initialization, drift classification, and QC now validate registered app versions, ports,
  package metadata, and active runtime configuration against `spernakit.psd1`.
- Split the mobile navigation into a lazy-loaded chunk so desktop sessions do not load it on the
  initial path.

### Changed

- File cleanup jobs now remove eligible files concurrently while retaining per-file failure
  reporting.
- Critical-path checks now account for Brotli and gzip output separately, verify the entry chunk's
  static imports, and enforce the restored gzip budget.

### Fixed

- Required fields in dashboard, API key, user, and workspace dialogs now expose validation errors
  when submitted empty.
- Added explicit autocomplete policies to non-authentication forms and corrected placeholder and
  action copy across authentication, files, notifications, profile, and workspace screens.
- The file upload drop zone now uses the native file input as its interactive control.
- Added an intentional touch highlight policy and protected technical identifiers from browser
  translation.
- WebSocket state checks now handle wrapped sockets consistently during connection and cleanup.

## [3.30.0] - 2026-07-26

### Changed

- Migrated the frontend router from React Router 7 to React Router 8. The `react-router-dom`
  package no longer exists upstream in v8; all 41 import sites now resolve from `react-router`
  directly, and `react-router-dom` has been dropped from `frontend/package.json`.
- `scripts/check-dependency-versions.ts` pins `react-router` in place of `react-router-dom` as a
  critical frontend dependency.
- The `react-routing` manual chunk in `frontend/vite.config.ts` no longer matches the removed
  `react-router-dom` directory.
- Updated `lucide-react` to 1.27.0 and `recharts` to 3.10.1.
- The fresh-release contract now treats the 3.29.0 public baseline as a floor rather than an exact
  pin: the package version must be at or above it, and `docs/template/CHANGELOG.md` must lead with
  the version being released, retain the baseline entry, and carry no heading that predates it.
  Previously any release after the baseline failed `bun run check:fresh-release` by construction.

### Security

- Resolves GHSA-qwww-vcr4-c8h2 (HIGH), a CSRF-protection bypass affecting React Router 7 in RSC
  mode. The container image is clean under the CI Trivy CRITICAL/HIGH gate without a suppression,
  so `.trivyignore` and its `trivyignores` wiring in the CI workflow have been removed.

## [3.29.0] - 2026-07-26

### Application foundation

- Bun-first TypeScript monorepo with shared, backend, and frontend workspaces.
- React and Vite frontend with responsive navigation, reusable UI primitives, theming, command
  palette support, keyboard shortcuts, and accessible interaction patterns.
- Elysia backend with typed request validation, consistent response envelopes, OpenAPI support,
  structured logging, compression, and health endpoints.
- SQLite and PostgreSQL schema implementations kept aligned by a blocking parity check.
- JSON configuration with generated schemas, environment overrides, secret separation, and
  startup validation.

### Authentication and authorization

- Cookie-based JWT sessions with refresh rotation, token revocation, and configurable timeouts.
- Password login, password reset, account lockout, session management, and optional OAuth
  providers.
- Five-tier role-based access control for system, administration, management, operator, and
  viewer responsibilities.
- API key management with scoped permissions and auditable use.
- CSRF, CORS, content security policy, request-size, rate-limit, and mutation protections.

### Product capabilities

- User, profile, team, and role administration.
- Dashboards, metrics, reports, saved filters, and export workflows.
- Real-time notifications with user preferences and WebSocket delivery.
- File upload, download, metadata, validation, and storage management.
- Application, email, OAuth, security, and operational settings.
- Database administration tools with protected mutation paths and audit logging.

### Operations and quality

- Local and production Docker workflows with explicit image-publication and license guards.
- Deterministic Bun dependency installation with exact template pins and lockfile validation.
- Blocking checks for configuration, schema parity, API contracts, feature wiring, documentation,
  dependency policy, formatting, linting, type safety, dead code, build output, and critical-path
  budgets.
- ESLint flat configs, strict TypeScript settings, Prettier formatting with Tailwind class ordering,
  and Knip dead-code analysis form one source-quality contract.
- `bun run deploy` builds and starts the local production stack through the same deployment script
  used for explicit local production operations.
- Template drift classification for pure, branded, infrastructure, and security-infrastructure
  files.
- Cross-platform setup and initialization scripts that create a branded derived application,
  initialize its database, generate required artifacts, run the quality gate, and create its
  initial commit.

### Template lifecycle

- This release is the minimum supported source for template synchronization.
- `bun run template:sync-plan -- --app ../<app>` produces a read-only review packet for a derived
  application.
- Releases without a predecessor use this complete baseline as their release notes. Future
  releases use conventional-commit ranges and resolvable comparison links.
- Version tag pushes require a matching local screenshot capture with at least five PNG files before
  the tag can be published.
