import { Info, Lock, Search } from 'lucide-react';
import { useState } from 'react';

import type { ConfigSection, SnapshotValue } from '@/api/runtimeConfig';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useRuntimeConfig } from '@/hooks/settings/useRuntimeConfig';
import { useAuthorization } from '@/hooks/useAuthorization';

import { FieldList } from './RuntimeConfigFieldList';
import { filterFields, formatLabel } from './runtimeConfigFilter';

function RuntimeConfigTab() {
	const { isSysop } = useAuthorization();
	const sysop = isSysop();
	const { data, error, isLoading } = useRuntimeConfig(sysop);
	const [search, setSearch] = useState('');

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
	// The snapshot names its own source; prefer it over a placeholder operators cannot act on.
	const appSlug = typeof snapshot?.app?.slug === 'string' ? snapshot.app.slug : null;
	const sections: [string, ConfigSection | Record<string, SnapshotValue>][] = snapshot
		? Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b))
		: [];

	const query = search.trim().toLowerCase();
	const visible: [string, ConfigSection | Record<string, SnapshotValue>][] = query
		? sections.flatMap(([name, section]) => {
				if (formatLabel(name).toLowerCase().includes(query)) return [[name, section]];
				const filtered = filterFields(section, query);
				return filtered ? [[name, filtered]] : [];
			})
		: sections;

	return (
		<div className="space-y-6">
			<Alert>
				<Info aria-hidden="true" className="size-4" />
				<AlertTitle>Read-only runtime configuration</AlertTitle>
				<AlertDescription>
					{/*
					 * One `<p>`, not five bare children. `AlertDescription` is a `grid gap-1`, so each
					 * text node and the inline `<code>` became its own grid row and a single sentence
					 * rendered as three stacked fragments at every viewport. The component already
					 * styles `[&_p]:leading-relaxed` for exactly this.
					 */}
					<p>
						The effective startup configuration loaded from{' '}
						{appSlug ? (
							<code translate="no">config/{appSlug}.json</code>
						) : (
							'the application config file'
						)}{' '}
						merged with defaults. These values change only on restart and cannot be
						edited here — settings that require a restart stay in the config file.
						Secrets (keys, cookie and webhook secrets, database and storage credentials)
						are redacted and never sent to the browser.
					</p>
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
				<>
					{/*
					 * A filter, because this is 4,062px of unindexed scroll — three and a half
					 * screens of fifteen alphabetical cards with no index and no jump list, so
					 * finding `server.trustProxy` meant reading everything above it. Matching a
					 * section keeps the whole card; matching a field keeps that field and the groups
					 * that contain it.
					 */}
					<div className="flex flex-wrap items-center gap-3">
						<div className="relative max-w-sm min-w-52 flex-1">
							<Search
								aria-hidden="true"
								className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								aria-label="Filter configuration"
								autoComplete="off"
								className="pl-9"
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Filter sections and keys…"
								value={search}
							/>
						</div>
						<p className="text-sm text-muted-foreground">
							{query
								? `${String(visible.length)} of ${String(sections.length)} sections`
								: `${String(sections.length)} sections`}
						</p>
					</div>

					{visible.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No configuration key matches “{search.trim()}”.
						</p>
					) : (
						/*
						 * A column flow rather than a two-column grid. The cards range from 150px
						 * (Metrics) to 798px (Database) and a grid row is as tall as its taller card,
						 * so at 1440 the eight rows left 1,959px of hard empty rectangle inside a
						 * 3,704px grid — Database Admin sat beside Database with a 647px void under
						 * it. Each card now starts directly under the previous one in its column.
						 * `gap-6` matches the 24px page rhythm the outer stack already uses; the old
						 * `gap-4` changed the rhythm halfway down the surface.
						 *
						 * A third column at `2xl`, the breakpoint the app already uses for its
						 * widest step (`2xl:grid-cols-4` on DashboardListPage, `2xl:grid-cols-3`
						 * on RolesTab). The flow stopped adapting at `lg`: 1440, 1920, 2250 and
						 * 2560 all rendered the same two columns, so inside the 95rem cap each
						 * card was 724px from 1920 up. Every field row is `justify-between` with
						 * the value right-aligned, so that width became dead space in the middle
						 * of the row rather than density — measured label-to-value gaps in the
						 * Alerting card ran 425–499px against a 653–674px row, across ~200 rows
						 * and 3,365px of inner scroll. Three columns puts each card near 480px at
						 * 1920–2560, roughly halving every gap, and leaves the 1440 layout alone.
						 */
						<div className="columns-1 gap-6 lg:columns-2 2xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
							{visible.map(([name, section]) => (
								<Card key={name}>
									<CardHeader>
										{/*
										 * The config key path on the title line, not on a row of
										 * its own. Keeping it is right — it is what an operator
										 * greps for — but for 10 of the 15 cards it is simply the
										 * title lowercased (Alerting/alerting, Server/server…), so
										 * two thirds of the surface spent a second header line
										 * restating the heading directly above it. As a trailing
										 * muted mono token it stays available to the five cards
										 * where it differs and disappears into the title for the
										 * rest.
										 */}
										<CardTitle className="flex flex-wrap items-baseline gap-2">
											{formatLabel(name)}
											<span className="font-mono text-xs font-normal text-muted-foreground">
												{name}
											</span>
										</CardTitle>
									</CardHeader>
									<CardContent>
										<FieldList fields={section} path={name} />
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}

export { RuntimeConfigTab };
