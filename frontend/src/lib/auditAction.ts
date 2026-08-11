/**
 * How an audit `action` string is broken into a method and a path for display.
 *
 * The same records render on two surfaces — the audit table on /settings/audit-logs and the
 * Recent activity card on /dashboard — and they used to render in two visual languages: the
 * table split the HTTP verb off into a `Badge`, while the card printed the whole string as one
 * undifferentiated run of muted text. Both now read the field through here, so there is one
 * answer to "what is a method" and one variant map behind it.
 */

/**
 * An HTTP method is metadata about a log line, not a state — so it stays neutral, with
 * `destructive` reserved for the one method that destroys something. POST was `default`, which
 * made every create look clickable.
 */
const METHOD_VARIANTS: Record<string, 'destructive' | 'outline' | 'secondary'> = {
	DELETE: 'destructive',
	PATCH: 'outline',
	POST: 'secondary',
	PUT: 'outline',
};

interface ParsedAuditAction {
	/** The HTTP method, or an empty string when the action does not start with a known one. */
	method: string;
	/** Everything after the method — the path, or the whole action when there is no method. */
	path: string;
	/** The `Badge` variant for `method`. Meaningless when `method` is empty. */
	variant: 'destructive' | 'outline' | 'secondary';
}

/** Split an audit action into its HTTP method and the rest of the string. */
function parseAuditAction(action: string): ParsedAuditAction {
	const method = action.split(' ')[0] ?? '';
	const variant = METHOD_VARIANTS[method];
	if (!variant) {
		return { method: '', path: action.trim(), variant: 'outline' };
	}
	return { method, path: action.slice(method.length).trim(), variant };
}

export { parseAuditAction };
export type { ParsedAuditAction };
