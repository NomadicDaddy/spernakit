import { Lock } from 'lucide-react';

import type { ConfigSection, SnapshotValue } from '@/api/runtimeConfig';

import { Badge } from '@/components/ui/badge';

import { formatLabel, isPlainObject } from './runtimeConfigFilter';

const REDACTED = '[REDACTED]';
const NOT_SET = '(not set)';

/** Render a single scalar value with sensible read-only styling. */
function ScalarValue({ value }: { value: boolean | number | string }) {
	if (typeof value === 'boolean') {
		return (
			/*
			 * On/off is the most scanned value on this page — 25-odd of these across fifteen cards —
			 * and both states used to be grey: `secondary` for Enabled, `outline` for Disabled, the
			 * same 12px near-white text in both. The reader had to *read* each badge to know the
			 * state. `success` is the same green the health checks and the scheduler use, so the
			 * on/off pattern of a card is now readable down the column edge.
			 */
			<Badge
				className={value ? undefined : 'text-muted-foreground'}
				variant={value ? 'success' : 'outline'}>
				{value ? 'Enabled' : 'Disabled'}
			</Badge>
		);
	}
	if (value === REDACTED) {
		return (
			<Badge className="font-mono" variant="outline">
				<Lock aria-hidden="true" className="size-3" />
				Redacted
			</Badge>
		);
	}
	if (value === NOT_SET || value === '') {
		return <span className="text-sm text-muted-foreground italic">Not set</span>;
	}
	// `wrap-anywhere`, not `break-all`: word boundaries are preferred and only genuinely
	// unbreakable tokens are split. Under `break-all` the App description broke mid-word at
	// 1024 — "Self-Hosted Multi-User Appl / ication Template" — with a space one word earlier.
	return <span className="font-mono text-sm wrap-anywhere text-foreground">{String(value)}</span>;
}

/** Render an array value as a list of badges, or an empty-state hint. */
function ArrayValue({ values }: { values: SnapshotValue[] }) {
	if (values.length === 0) {
		return <span className="text-sm text-muted-foreground italic">None</span>;
	}
	if (values.every((v) => typeof v !== 'object')) {
		return (
			/*
			 * `max-w-full` and the wrapping override are the mechanism fix, not the symptom fix.
			 * Badge is atomic — its base carries `whitespace-nowrap shrink-0 w-fit` — so a single
			 * long entry is wider than its column at any width, and under `justify-end` a flex item
			 * that overflows escapes toward the START edge: a 157px badge in a 101px column painted
			 * 56px of itself over the field label, with `elementFromPoint` at the label's own text
			 * returning the badge. ScalarValue's `wrap-anywhere` at :44 does not reach in here.
			 * `justify-end` is gated to `sm` because the stacked row below it is left-aligned.
			 */
			<div className="flex flex-wrap gap-1 sm:justify-end">
				{values.map((v, i) => (
					<Badge
						className="max-w-full font-mono wrap-anywhere whitespace-normal"
						key={`${String(v)}-${i}`}
						variant="outline">
						{String(v)}
					</Badge>
				))}
			</div>
		);
	}
	return (
		<div className="space-y-2">
			{values.map((v, i) => (
				<div className="rounded-md border border-border/60 p-2" key={i}>
					{isPlainObject(v) ? (
						<FieldList fields={v} />
					) : (
						<ScalarValue value={v as string} />
					)}
				</div>
			))}
		</div>
	);
}

/**
 * Render one labelled field, dispatching on the value shape.
 *
 * `dt`/`dd` inside a `dl`, not spans inside divs. The ~200 label/value pairs on this surface were
 * unassociated text: the accessibility snapshot of one card is a flat run of StaticText with no
 * pairing and no grouping, in which the literal word "Enabled" appears three times carrying three
 * different meanings (a field label, a Disabled badge's sibling, an on-state badge) and nothing
 * marks which value belongs to which key. The group captions were `<p>`, so the three-level
 * nesting the card shows visually was not in the outline at all. Class strings and visual output
 * are unchanged — only the element names are. (`dl > div > (dt|dd)` is the valid grouping form;
 * Tailwind's preflight already zeroes the UA `dd` margin.)
 */
function Field({
	depth,
	label,
	path,
	value,
}: {
	depth: number;
	label: string;
	path: string;
	value: SnapshotValue;
}) {
	if (isPlainObject(value) && Object.keys(value).length > 0) {
		const captionId = `runtime-config-${path}`;
		return (
			<div className="space-y-1 py-1.5">
				{/*
				 * Depth is carried by colour, not by indent alone. Nesting runs three levels deep
				 * here (Health Check › THRESHOLDS › AUTH) and every level used to render as the same
				 * 12px muted uppercase caption, separated only by a 17px step and a hairline at
				 * `border-border/60` — so a reader could not tell whether AUTH was a sibling of
				 * THRESHOLDS or a child of it without measuring. A card's own sub-sections are now
				 * at full foreground; anything nested inside one stays muted.
				 */}
				<dt
					className={
						depth === 0
							? 'text-xs font-semibold tracking-wide text-foreground uppercase'
							: 'text-xs font-semibold tracking-wide text-muted-foreground uppercase'
					}
					id={captionId}>
					{label}
				</dt>
				<dd className="ml-1 border-l border-border pl-4">
					<FieldList
						depth={depth + 1}
						fields={value}
						labelledBy={captionId}
						path={path}
					/>
				</dd>
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-1 py-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
			{/*
			 * The label gets a floor. Without one a wide value collapsed it: "Allowed Mime Types" on
			 * the Storage card was squeezed to 77px and wrapped over three lines while the badges
			 * beside it took 421px of a 564px card, leaving 143px of label runway unused.
			 *
			 * The floor is gated at `sm`, not removed. It fixes a desktop defect in a 564px card, and
			 * deleting it re-opens that bug rather than tidying anything. Below
			 * `sm` a 160px label floor plus a 16px gap leaves 158px of a 334px row for the value, so
			 * numbers wrapped across line boxes; the row stacks there instead, and the value gets
			 * the full width under its own label.
			 */}
			<dt className="text-sm text-muted-foreground sm:min-w-40 sm:shrink-0">{label}</dt>
			<dd className="min-w-0 sm:flex-1 sm:text-right">
				{/*
				 * An empty object falls through to the scalar row and renders `None`, the same way
				 * an empty array already does two rows above it. It used to take the group branch:
				 * an uppercase caption over a zero-height indented container, so HEADERS stood as
				 * a heading over Secret / Timeout Ms / Url — its siblings, measured at the
				 * identical 706px left offset — with nothing on screen saying they were not its
				 * children. `webhook.headers` is the only empty object in the current snapshot,
				 * but any empty object in config produced it.
				 */}
				{isPlainObject(value) ? (
					<ArrayValue values={[]} />
				) : Array.isArray(value) ? (
					<ArrayValue values={value} />
				) : (
					<ScalarValue value={value} />
				)}
			</dd>
		</div>
	);
}

/** Render every field of a section/object in stable, alphabetical order. */
function FieldList({
	depth = 0,
	fields,
	labelledBy,
	path = '',
}: {
	/** Nesting level, so a group header can say whether it is a card sub-section or inside one. */
	depth?: number;
	fields: ConfigSection | Record<string, SnapshotValue>;
	/** Id of the caption naming this list, when it is a nested group rather than a card body. */
	labelledBy?: string;
	/** Dotted key path, so nested group captions get collision-free ids to be labelled by. */
	path?: string;
}) {
	const entries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
	return (
		<dl
			className="divide-y divide-border/40"
			{...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}>
			{entries.map(([key, value]) => (
				<Field
					depth={depth}
					key={key}
					label={formatLabel(key)}
					path={path ? `${path}-${key}` : key}
					value={value}
				/>
			))}
		</dl>
	);
}

export { FieldList };
