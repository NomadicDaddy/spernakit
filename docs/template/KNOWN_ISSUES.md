# Known Issues - Spernakit v3

A running list of known limitations and deferrals for the active v3 template. Keep
entries blunt, factual, and tied to the current codebase.

If something here turns into a real failure, escalate it into tracked work and fix it.

---

## Destructive-confirmation check is file-level, not AST

**Problem.** `scripts/check-destructive-confirmation.ts` scans for nearby confirmation evidence
using string and regex heuristics rather than parsing the TSX into an AST and proving a
`ConfirmAlertDialog` (or equivalent) is wired to the destructive handler.

**Why this is currently acceptable.** The scan covers every page in the template and catches
missing confirmation near delete, reset, and disable handlers. An AST implementation would improve
precision without changing the enforced policy.

**Where to look.** `scripts/check-destructive-confirmation.ts`.

---

## bunfig.toml requires `env = false`

**Problem.** Spernakit's JSON-only configuration policy (every config value lives in `config/*.json`, validated by TypeBox) is enforced in part by `bunfig.toml` setting `env = false`. This disables Bun's automatic `.env` loading at the runtime level. Reverting this flag would silently re-enable a configuration channel the rest of the system does not validate.

**Why this is enforced.** This is non-negotiable for Spernakit's JSON-only config model, not a deferral. The constraint is documented here so it is not relaxed by accident.

**Where to look.** `bunfig.toml` at repo root. Any future code path that needs to read `process.env` directly must:

1. Keep the read inside `backend/src/config/configSecrets.ts` or `configLogger.ts`, or update `scripts/check-process-env.ts` with a clear justification.
2. Add secret override keys to `SECRET_CONFIG_KEYS` or `NESTED_SECRET_KEYS` when applicable.
3. Keep non-secret settings in JSON config.
