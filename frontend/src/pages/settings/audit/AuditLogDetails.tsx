/**
 * The expanded panel under an audit row.
 *
 * It lives beside `AuditLogsTab` rather than inside its `renderExpandedRow` prop because the parse-
 * and-fall-back logic is about twenty lines and the tab is already close to the 300-line gate.
 */

/** What is left after the nested-value guard below: everything JSON can hold on one line. */
type ScalarEntry = [string, boolean | null | number | string];

/**
 * A flat JSON object, which is the shape every `details` payload the API writes actually has.
 *
 * The value arrives already parsed — `auditLogs.details` is a JSON column — but the older records
 * and the route's own OpenAPI examples carry a JSON *string*, so both are accepted here. Note that
 * `JSON.parse` on an object does not throw usefully: it stringifies the argument to
 * `"[object Object]"` first and then fails on that, which is what put a raw object in the `<pre>`
 * fallback and took the whole surface down with "Objects are not valid as a React child".
 */
function parseDetails(details: unknown): null | ScalarEntry[] {
	if (!details) return null;
	let parsed: unknown = details;
	if (typeof details === 'string') {
		try {
			parsed = JSON.parse(details);
		} catch {
			return null;
		}
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const entries = Object.entries(parsed as Record<string, unknown>);
	// A nested value has no honest single-line rendering, so those fall back to the raw view.
	// `typeof null` is `'object'`, hence the second half — a null field is renderable as an em dash.
	if (entries.some(([, v]) => typeof v === 'object' && v !== null)) return null;
	return entries as ScalarEntry[];
}

/** `requestId` → `Request id`, so the keys read as labels rather than as identifiers. */
function formatKey(key: string): string {
	const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function AuditLogDetails({ details, id }: { details: unknown; id: string }) {
	const entries = parseDetails(details);

	return (
		/*
		 * `max-w-3xl` on the content, not on the band. The panel is full-bleed by design — it is the
		 * disclosure for a row that spans the table — but its payload was a `JSON.stringify` dump
		 * about 365px wide sitting in 1470px of muted surface, so roughly three quarters of the
		 * panel was empty and the two values the row was opened for read as a fragment of console
		 * output stranded at the far left of a grey slab. Capping the content leaves the band intact
		 * and stops the eye traversing a screen of nothing to reach it.
		 */
		<div className="border-t bg-muted p-4" id={id}>
			<p className="mb-2 text-sm font-medium">Details</p>
			{entries ? (
				/*
				 * A key/value grid in the same treatment the table's own cells use: muted labels in
				 * the body face, values in the `font-mono` the IP Address column already renders. A
				 * `dl` rather than a table — this is one record's fields, not a second data set —
				 * with `dt`/`dd` as direct grid children so both columns share one track pair.
				 */
				<dl className="grid max-w-3xl grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-xs">
					{entries.map(([key, value]) => (
						<div className="contents" key={key}>
							<dt className="text-muted-foreground">{formatKey(key)}</dt>
							<dd className="font-mono break-all" translate="no">
								{value === null ? '—' : String(value)}
							</dd>
						</div>
					))}
				</dl>
			) : (
				/*
				 * Not flat, not JSON, or absent — show it verbatim rather than guessing at it.
				 * Always through `String`/`JSON.stringify`: `details` is `unknown`, and a nested
				 * payload reaching React as a live object is a render crash, not a bad layout.
				 */
				<pre
					className="max-w-3xl overflow-x-auto text-xs text-muted-foreground"
					translate="no">
					{details === null || details === undefined
						? 'No details available'
						: typeof details === 'string'
							? details
							: JSON.stringify(details, null, 2)}
				</pre>
			)}
		</div>
	);
}
