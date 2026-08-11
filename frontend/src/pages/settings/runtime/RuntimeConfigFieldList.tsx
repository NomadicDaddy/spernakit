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
			<div className="flex flex-wrap justify-end gap-1">
				{values.map((v, i) => (
					<Badge className="font-mono" key={`${String(v)}-${i}`} variant="outline">
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

/** Render one labelled field, dispatching on the value shape. */
function Field({ depth, label, value }: { depth: number; label: string; value: SnapshotValue }) {
	if (isPlainObject(value)) {
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
				<p
					className={
						depth === 0
							? 'text-xs font-semibold tracking-wide text-foreground uppercase'
							: 'text-xs font-semibold tracking-wide text-muted-foreground uppercase'
					}>
					{label}
				</p>
				<div className="ml-1 border-l border-border pl-4">
					<FieldList depth={depth + 1} fields={value} />
				</div>
			</div>
		);
	}
	return (
		<div className="flex items-start justify-between gap-4 py-1.5">
			{/*
			 * The label gets a floor. Without one a wide value collapsed it: "Allowed Mime Types" on
			 * the Storage card was squeezed to 77px and wrapped over three lines while the badges
			 * beside it took 421px of a 564px card, leaving 143px of label runway unused.
			 */}
			<span className="min-w-40 shrink-0 text-sm text-muted-foreground">{label}</span>
			<div className="min-w-0 flex-1 text-right">
				{Array.isArray(value) ? (
					<ArrayValue values={value} />
				) : (
					<ScalarValue value={value} />
				)}
			</div>
		</div>
	);
}

/** Render every field of a section/object in stable, alphabetical order. */
function FieldList({
	depth = 0,
	fields,
}: {
	/** Nesting level, so a group header can say whether it is a card sub-section or inside one. */
	depth?: number;
	fields: ConfigSection | Record<string, SnapshotValue>;
}) {
	const entries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
	return (
		<div className="divide-y divide-border/40">
			{entries.map(([key, value]) => (
				<Field depth={depth} key={key} label={formatLabel(key)} value={value} />
			))}
		</div>
	);
}

export { FieldList };
