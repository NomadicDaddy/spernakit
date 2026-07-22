// The fast static subset (`bun run smoke:qc:fast`, also what `.githooks/pre-commit` runs):
// formatting, line-limit, types, and lint — no build, no crawl, no slow project checks. This is
// the inner-loop gate: run it repeatedly while fixing errors, then run the full `bun run smoke:qc`
// once before commit.
//
// These are `smoke.json` commands rather than step names because that file is the single source of
// truth for what a qc step is; `selectFastQcSteps` throws if any entry here stops matching, so the
// two cannot silently drift apart.
//
// The order is measured, not intuited: it minimises the time a doomed tree takes to fail. Rank by
// cost ÷ P(fail) — cheap-and-flaky first, expensive-and-reliable last — since that is the ordering
// that minimises expected wasted time, not raw cost and not raw failure rate.
//
// Re-mine before changing. Failure counts are distinct runs (logs containing `[FAIL] <description>`)
// over `.aidd/iterations/*.log`; warm costs are the `duration` fields in `scripts/smoke-cache.json`.
//
//   step             warm cost   fails / 1599 runs   cost ÷ P(fail)   (measured 2026-07-21)
//   check:max-lines     0.28s       3                    149
//   typecheck           9.65s      57                    271
//   format:check        6.40s      25                    409
//   lint               26.98s     105                    411
//
// format:check runs ahead of lint here because lint is this repo's most expensive static check by a
// wide margin (~27s against format:check's ~6s) while their ratios are within 1% of each other —
// so when both would fail, reporting the cheaper one first saves ~27s per doomed commit. aidd's
// absolute numbers differ (its lint is ~10s) but rank identically, so both repos run this order.
//
// leak-guard is not part of this subset: it scans the staged index diff (runtime state), so it is
// uncacheable-by-design and the hook keeps it as a direct call ahead of `smoke:qc:fast`.
export const FAST_QC_COMMANDS = [
	'bun run check:max-lines',
	'bun run typecheck',
	'bun run format:check',
	'bun run lint',
] as const;
