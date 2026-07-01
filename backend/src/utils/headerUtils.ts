/**
 * Append a token to the Vary header without duplicating existing tokens.
 * @param headers - Response headers record
 * @param token - Vary token to append (e.g. 'Origin', 'Accept-Encoding')
 */
export function appendVaryToken(headers: Record<string, number | string>, token: string): void {
	const existing = typeof headers['Vary'] === 'string' ? headers['Vary'] : '';
	const tokens = existing
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
	if (!tokens.includes(token)) {
		tokens.push(token);
	}
	headers['Vary'] = tokens.join(', ');
}
