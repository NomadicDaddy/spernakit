import { useQuery } from '@tanstack/react-query';
import { type Database, Eye, LayoutGrid, Play, Table } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { NavLink, useSearchParams } from 'react-router';

import { ApiError } from '@/api/client';
import { getSchema } from '@/api/databaseAdmin';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRuntimeConfig } from '@/hooks/settings/useRuntimeConfig';
import { useAuthorization } from '@/hooks/useAuthorization';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';
import { cn } from '@/lib/utils';

const DataViewerPanel = lazy(() =>
	import('./DataViewerPanel').then((m) => ({ default: m.DataViewerPanel })),
);
const ErdPanel = lazy(() => import('./ErdPanel').then((m) => ({ default: m.ErdPanel })));
const SchemaExplorerPanel = lazy(() =>
	import('./SchemaExplorerPanel').then((m) => ({ default: m.SchemaExplorerPanel })),
);
const SqlSandboxPanel = lazy(() =>
	import('./SqlSandboxPanel').then((m) => ({ default: m.SqlSandboxPanel })),
);

type Panel = 'data' | 'erd' | 'schema' | 'sql';

const VALID_PANELS = new Set<string>(['data', 'erd', 'schema', 'sql']);

const panels: { icon: typeof Database; id: Panel; label: string }[] = [
	{ icon: Table, id: 'schema', label: 'Schema' },
	{ icon: LayoutGrid, id: 'erd', label: 'ERD' },
	{ icon: Eye, id: 'data', label: 'Data' },
	{ icon: Play, id: 'sql', label: 'SQL' },
];

/**
 * The panel rail's link treatment, lifted verbatim from `TabLayout`'s nav.
 *
 * These four panels used to be a row of `Button`s — filled for the active one, outlined for the
 * rest — sitting directly beneath the settings tab rail, which is an underline rail. Two rails
 * doing the same job in two different visual languages, stacked, is the only place in the app that
 * happens, and the button group reads as four actions rather than as where you currently are.
 * Sharing the class list rather than approximating it is what keeps them from drifting apart again.
 */
const PANEL_LINK = 'rounded-sm border-b-2 px-1 pb-3 text-sm font-medium whitespace-nowrap';

/**
 * Applies the panel selection to a query string.
 *
 * `schema` is the default panel and is expressed by the parameter's absence, so a link to it and a
 * programmatic switch to it have to agree on removing rather than setting. They read the rule from
 * here so they cannot disagree.
 */
function withPanel(params: URLSearchParams, panel: Panel) {
	const next = new URLSearchParams(params);
	if (panel === 'schema') {
		next.delete('panel');
	} else {
		next.set('panel', panel);
	}
	return next;
}

function DatabaseTab() {
	const { isSysop } = useAuthorization();
	const [searchParams, setSearchParams] = useSearchParams();
	const panelParam = searchParams.get('panel') ?? 'schema';
	const activePanel: Panel = VALID_PANELS.has(panelParam) ? (panelParam as Panel) : 'schema';
	const selectedTable = searchParams.get('table') ?? undefined;
	const sysop = isSysop();
	const { data: runtimeConfig, isLoading: runtimeConfigLoading } = useRuntimeConfig(sysop);
	const databaseAdminEnabled = runtimeConfig?.data.databaseAdmin?.enabled === true;

	const setActivePanel = (panel: Panel) => {
		setSearchParams((prev) => withPanel(prev, panel), { replace: true });
	};

	/** The `to` for a panel link — the current query with the panel rule applied. */
	const panelSearch = (panel: Panel) => {
		const query = withPanel(searchParams, panel).toString();
		return query ? `?${query}` : '';
	};

	const setSelectedTable = (table: string | undefined) => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				if (table) {
					next.set('table', table);
				} else {
					next.delete('table');
				}
				next.delete('dataPage');
				return next;
			},
			{ replace: true },
		);
	};

	const { error: schemaError } = useQuery({
		enabled: databaseAdminEnabled,
		queryFn: getSchema,
		queryKey: ['database-admin', 'schema'],
		retry: (failureCount, error) => {
			if (error instanceof ApiError && error.status === 501) return false;
			return failureCount < 3;
		},
		staleTime: STALE_TIME_SHORT,
		throwOnError: false,
	});

	const isPostgresql = schemaError instanceof ApiError && schemaError.status === 501;

	if (!sysop) {
		return (
			<Card>
				<CardContent className="py-8">
					<p className="text-center text-muted-foreground">
						You do not have permission to access the database admin panel. SYSOP role or
						higher is required.
					</p>
				</CardContent>
			</Card>
		);
	}

	if (runtimeConfigLoading) {
		return <Skeleton className="h-[400px] w-full" />;
	}

	if (!databaseAdminEnabled) {
		return (
			<Card>
				<CardContent className="py-8">
					<p className="text-center text-muted-foreground">
						The database admin panel is disabled by runtime configuration.
					</p>
				</CardContent>
			</Card>
		);
	}

	if (isPostgresql) {
		return (
			<Card>
				<CardContent className="py-8">
					<p className="text-center text-muted-foreground">
						The database admin panel is not available with the PostgreSQL dialect. It is
						only supported when using SQLite.
					</p>
				</CardContent>
			</Card>
		);
	}

	function handleSelectTable(tableName: string) {
		setSelectedTable(tableName);
		if (activePanel === 'erd') {
			setActivePanel('schema');
		}
	}

	return (
		<div className="space-y-4">
			{/*
			 * Panel navigation. Links rather than buttons: the panel already lives in the URL, so
			 * each one has a real address, and rendering that address means the rail can be opened
			 * in a new tab and read by assistive tech as navigation — which is what it is — rather
			 * than as four toggle buttons. `replace` keeps panel switching out of the back stack,
			 * matching what `setActivePanel` already did.
			 */}
			<nav aria-label="Database panels" className="flex items-center border-b">
				<div className="-mb-px flex scrollbar-none gap-4 overflow-x-auto">
					{panels.map(({ icon: Icon, id, label }) => (
						<NavLink
							className={cn(
								PANEL_LINK,
								'flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
								activePanel === id
									? 'border-primary text-foreground'
									: 'border-transparent text-muted-foreground hover:text-foreground',
							)}
							key={id}
							replace
							to={{ search: panelSearch(id) }}
							{...(activePanel === id ? { 'aria-current': 'page' as const } : {})}>
							<Icon aria-hidden="true" className="size-4" />
							{label}
						</NavLink>
					))}
				</div>
			</nav>

			{/* Active panel */}
			<Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
				{activePanel === 'schema' && (
					<SchemaExplorerPanel
						onSelectTable={setSelectedTable}
						selectedTable={selectedTable}
					/>
				)}
				{activePanel === 'erd' && <ErdPanel onSelectTable={handleSelectTable} />}
				{activePanel === 'data' && (
					<DataViewerPanel onSelectTable={setSelectedTable} tableName={selectedTable} />
				)}
				{activePanel === 'sql' && <SqlSandboxPanel />}
			</Suspense>
		</div>
	);
}

export { DatabaseTab };
