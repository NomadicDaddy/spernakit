const IDEMPOTENT_RULES: { pattern: RegExp; replacement: string }[] = [
	{ pattern: /^DROP\s+TABLE\s+/i, replacement: 'DROP TABLE IF EXISTS ' },
	{ pattern: /^DROP\s+INDEX\s+/i, replacement: 'DROP INDEX IF EXISTS ' },
	{ pattern: /^CREATE\s+TABLE\s+/i, replacement: 'CREATE TABLE IF NOT EXISTS ' },
	{ pattern: /^CREATE\s+UNIQUE\s+INDEX\s+/i, replacement: 'CREATE UNIQUE INDEX IF NOT EXISTS ' },
	{ pattern: /^CREATE\s+INDEX\s+/i, replacement: 'CREATE INDEX IF NOT EXISTS ' },
];

function rewriteSqlForIdempotency(statement: string): string {
	if (/IF\s+(?:NOT\s+)?EXISTS/i.test(statement)) {
		return statement;
	}
	for (const rule of IDEMPOTENT_RULES) {
		if (rule.pattern.test(statement)) {
			return statement.replace(rule.pattern, rule.replacement);
		}
	}
	return statement;
}

export { rewriteSqlForIdempotency };
