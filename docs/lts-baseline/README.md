# LTS Baselines — v3.13.0-lts

Snapshotted 2026-06-29. These files are diffable evidence of the public surface and quality state at the v3.13.0-lts tag. `scripts/check-lts-surface.ts` reads the cheap baselines (template-manifest, config-schema, env-shape) on every `smoke:qc` run.

Refresh a baseline on main only for deliberate, documented surface changes accepted under `docs/template/LTS.md`.

## Contents

| File                        | Purpose                                                        | Wired into smoke:qc |
| --------------------------- | -------------------------------------------------------------- | ------------------- |
| `template-manifest.json`    | Template file classification (branded / infrastructure / pure) | yes                 |
| `config-schema.json`        | Zod-derived JSON Schema for the application config surface     | yes                 |
| `env-shape.json`            | Allowed `process.env` reads (NODE_ENV + templated secret keys) | yes                 |
| `openapi.json`              | Backend OpenAPI 3.1 spec (137 endpoints, 113 paths)            | no — heavy, manual  |
| `db-schema.sql`             | SQLite schema dump (26 tables, 96 indexes)                     | no — heavy, manual  |
| `smoke-qc.txt`              | Full `smoke:qc --force` transcript at LTS tag                  | reference only      |
| `crawltest-results.json`    | Preview-mode crawl output at LTS tag                           | reference only      |
| `feature-inventory.json`    | `.aidd/features/` summary (98/98 completed)                    | reference only      |
| `knip-final.json`           | Clean knip output proving zero unused exports/files/deps       | reference only      |
| `template-manifest.json`    | Manifest at LTS tag — also used by `check:lts-surface`         | yes                 |
| `migrations-pre-squash/`    | Pre-squash migration files preserved for forensic reference    | n/a                 |
| `triage-dance-followups.md` | Disposition log for 9 dance follow-ups (all app-specific)      | n/a                 |

## Not captured at LTS tag

- **`supertest.txt`** — `bun run supertest` requires Docker stack up + screenshot regeneration. Capture during v3.13.x patch verification only when a regression is suspected.
- **`web-vitals.json`** — production-build LCP/CLS/INP capture requires preview-mode crawl with full vitals sampling. Out of scope for the LTS tag itself; capture during patch verification if performance is in question.

## Patch-release workflow

Before tagging any `v3.13.x`:

1. Re-run `scripts/extract-openapi-baseline.ts` and `bun --cwd backend db:dump-schema`; diff against `openapi.json` and `db-schema.sql`. Drift means you broke the contract — revert or branch a successor line (per `docs/template/LTS.md`).
2. Re-run `bunx knip` and confirm clean. Update `knip-final.json` only if a security advisory legitimately added unused-but-pinned deps.
3. `smoke:qc --force` must pass green. The cheap surface guards (template-manifest, config-schema, env-shape) auto-fail if any drift.
