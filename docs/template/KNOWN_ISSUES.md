# Known Issues — Spernakit v3.13.0 LTS

This is the living-with list at LTS. Every entry below is a known limitation or deferral that the maintainers have evaluated and accepted as non-gating for the v3.13.0 LTS tag. New entries land via the LTS amendment process described in [`LTS.md`](LTS.md).

Voice: blunt and factual. If something here turns into a real-world failure during a v3.13.x patch cycle, it gets escalated and fixed — otherwise it stays parked.

---

## Destructive-confirmation check is file-level, not AST

**Problem.** `scripts/check-destructive-confirmation.ts` scans for confirmation evidence using whole-file string/regex heuristics rather than parsing the TSX into an AST and proving a `ConfirmAlertDialog` (or equivalent) is wired to the destructive handler. An AST rewrite was scoped during LTS preparation but deferred.

**Why acceptable at LTS.** The current file-level scan passes across every page in the template and catches the real failure modes that motivated the check (missing confirmation on delete/reset/disable handlers). No false-negatives have been observed in template or derived-app crawltest sweeps. The AST upgrade is a precision improvement, not a correctness fix.

**Where to look.** `scripts/check-destructive-confirmation.ts`. Upgrade to AST-based parsing only if a real-world false-negative emerges in a v3.13.x patch — at which point the upgrade qualifies as a correctness fix under LTS scope.

---

## Heavy LTS surface checks are not wired into smoke:qc

**Problem.** Two surface-baseline checks were considered for `smoke:qc` and rejected as too expensive for every QC run:

- OpenAPI spec capture and diff against `docs/lts-baseline/openapi.json`
- Database schema dump and diff against `docs/lts-baseline/db-schema.sql`

Both require booting the backend or running a full migration to produce the comparison artifact, which would multiply QC time several-fold for marginal benefit on most edits.

**Why acceptable at LTS.** The lighter `check:lts-surface` guard (Zod config schema, template-manifest, and `process.env` reads) runs in `smoke:qc` and catches the high-frequency drift vectors. OpenAPI and DB schema drift are slow-moving and verifiable on demand.

**Where to look.** Capture and diff manually before each v3.13.x patch tag:

- `bun scripts/extract-openapi-baseline.ts` — regenerates the OpenAPI snapshot
- `bun --cwd backend db:dump-schema` — emits the current SQL schema

Compare against the baselines under `docs/lts-baseline/openapi.json` and `docs/lts-baseline/db-schema.sql`. Any diff requires either revert or a successor-line branch decision.

---

## Dance follow-up items remain app-specific

**Problem.** The LTS dance surfaced follow-up items across derived apps. Triage classified them as caused by app-local code or app-local feature scope, not by template defects.

**Why acceptable at LTS.** None of those items is reproducible in the bare template. Pulling app-specific fixes into the template at LTS would broaden surface area without benefit and would risk breaking the apps that already coped with the issue locally.

**Where to look.** `docs/lts-baseline/triage-dance-followups.md` carries the per-item classification. The actual remediation tickets live in each derived app's `.aidd/features/` directory.

---

## bunfig.toml requires `env = false`

**Problem.** Spernakit's JSON-only configuration policy (every config value lives in `config/*.json`, validated by Zod) is enforced in part by `bunfig.toml` setting `env = false`. This disables Bun's automatic `.env` loading at the runtime level. Reverting this flag would silently re-enable a configuration channel the rest of the system does not validate.

**Why acceptable at LTS.** This is non-negotiable for LTS, not a deferral. The constraint is documented here so it is not relaxed by accident during a patch.

**Where to look.** `bunfig.toml` at repo root. Any future code path that needs to read `process.env` directly must:

1. Add the variable to `config/env-shape.json` (the canonical allowlist).
2. Update `scripts/check-process-env.ts` if the read pattern is novel.
3. Follow the LTS amendment process in `LTS.md` before merging.
