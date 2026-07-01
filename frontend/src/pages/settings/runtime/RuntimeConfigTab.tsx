import { Info, Lock } from 'lucide-react';

import type { ConfigSection, SnapshotValue } from '@/api/runtimeConfig';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRuntimeConfig } from '@/hooks/settings/useRuntimeConfig';
import { useAuthorization } from '@/hooks/useAuthorization';

const REDACTED = '[REDACTED]';
const NOT_SET = '(not set)';

/** Turn a camelCase config key into a human-readable label. */
function formatLabel(key: string): string {
	const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isPlainObject(value: SnapshotValue): value is Record<string, SnapshotValue> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Render a single scalar value with sensible read-only styling. */
function ScalarValue({ value }: { value: boolean | number | string }) {
	if (typeof value === 'boolean') {
		return (
			<Badge variant={value ? 'secondary' : 'outline'}>
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
		return <span className="text-muted-foreground text-sm italic">Not set</span>;
	}
	return <span className="text-foreground font-mono text-sm break-all">{String(value)}</span>;
}

/** Render an array value as a list of badges, or an empty-state hint. */
function ArrayValue({ values }: { values: SnapshotValue[] }) {
	if (values.length === 0) {
		return <span className="text-muted-foreground text-sm italic">None</span>;
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
				<div className="border-border/60 rounded-md border p-2" key={i}>
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
function Field({ label, value }: { label: string; value: SnapshotValue }) {
	if (isPlainObject(value)) {
		return (
			<div className="space-y-1">
				<p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
					{label}
				</p>
				<div className="border-border/60 ml-1 border-l pl-3">
					<FieldList fields={value} />
				</div>
			</div>
		);
	}
	return (
		<div className="flex items-start justify-between gap-4 py-1.5">
			<span className="text-muted-foreground text-sm">{label}</span>
			<div className="text-right">
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
function FieldList({ fields }: { fields: ConfigSection | Record<string, SnapshotValue> }) {
	const entries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
	return (
		<div className="divide-border/40 divide-y">
			{entries.map(([key, value]) => (
				<Field key={key} label={formatLabel(key)} value={value} />
			))}
		</div>
	);
}

function RuntimeConfigTab() {
	const { isSysop } = useAuthorization();
	const sysop = isSysop();
	const { data, error, isLoading } = useRuntimeConfig(sysop);

	if (!sysop) {
		return (
			<Alert variant="destructive">
				<Lock aria-hidden="true" className="size-4" />
				<AlertTitle>SYSOP access required</AlertTitle>
				<AlertDescription>
					Only system operators can view the runtime configuration overview.
				</AlertDescription>
			</Alert>
		);
	}

	const snapshot = data?.data;
	const sections = snapshot
		? Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b))
		: [];

	return (
		<div className="space-y-6">
			<Alert>
				<Info aria-hidden="true" className="size-4" />
				<AlertTitle>Read-only runtime configuration</AlertTitle>
				<AlertDescription>
					The effective startup configuration loaded from{' '}
					<code>config/&lt;slug&gt;.json</code> merged with defaults. These values change
					only on restart and cannot be edited here — settings that require a restart stay
					in the config file. Secrets (keys, cookie and webhook secrets, database and
					storage credentials) are redacted and never sent to the browser.
				</AlertDescription>
			</Alert>

			{isLoading && (
				<div className="space-y-4">
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
			)}

			{!isLoading && error && (
				<Alert variant="destructive">
					<AlertTitle>Unable to load configuration</AlertTitle>
					<AlertDescription>
						The runtime configuration overview could not be retrieved. Please try again.
					</AlertDescription>
				</Alert>
			)}

			{!isLoading && !error && snapshot && (
				<div className="grid gap-4 lg:grid-cols-2">
					{sections.map(([name, section]) => (
						<Card key={name}>
							<CardHeader>
								<CardTitle>{formatLabel(name)}</CardTitle>
								<CardDescription>Read-only effective values</CardDescription>
							</CardHeader>
							<CardContent>
								<FieldList fields={section} />
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}

export { RuntimeConfigTab };
