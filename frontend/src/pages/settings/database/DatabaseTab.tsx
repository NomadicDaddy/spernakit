import { useQuery } from '@tanstack/react-query';
import { type Database, Eye, LayoutGrid, Play, Table } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ApiError } from '@/api/client';
import { getSchema } from '@/api/databaseAdmin';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRuntimeConfig } from '@/hooks/settings/useRuntimeConfig';
import { useAuthorization } from '@/hooks/useAuthorization';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';

const DataViewerPanel = lazy(() =>
	import('./DataViewerPanel').then((m) => ({ default: m.DataViewerPanel }))
);
const ErdPanel = lazy(() => import('./ErdPanel').then((m) => ({ default: m.ErdPanel })));
const SchemaExplorerPanel = lazy(() =>
	import('./SchemaExplorerPanel').then((m) => ({ default: m.SchemaExplorerPanel }))
);
const SqlSandboxPanel = lazy(() =>
	import('./SqlSandboxPanel').then((m) => ({ default: m.SqlSandboxPanel }))
);

type Panel = 'data' | 'erd' | 'schema' | 'sql';

const VALID_PANELS = new Set<string>(['data', 'erd', 'schema', 'sql']);

const panels: { icon: typeof Database; id: Panel; label: string }[] = [
	{ icon: Table, id: 'schema', label: 'Schema' },
	{ icon: LayoutGrid, id: 'erd', label: 'ERD' },
	{ icon: Eye, id: 'data', label: 'Data' },
	{ icon: Play, id: 'sql', label: 'SQL' },
];

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
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				if (panel === 'schema') {
					next.delete('panel');
				} else {
					next.set('panel', panel);
				}
				return next;
			},
			{ replace: true }
		);
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
			{ replace: true }
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
					<p className="text-muted-foreground text-center">
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
					<p className="text-muted-foreground text-center">
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
					<p className="text-muted-foreground text-center">
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
			{/* Panel navigation */}
			<div className="flex gap-2">
				{panels.map(({ icon: Icon, id, label }) => (
					<Button
						key={id}
						onClick={() => setActivePanel(id)}
						size="sm"
						variant={activePanel === id ? 'default' : 'outline'}>
						<Icon className="mr-1.5 h-4 w-4" />
						{label}
					</Button>
				))}
			</div>

			{/* Active panel */}
			<Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
				{activePanel === 'schema' && (
					<SchemaExplorerPanel
						onSelectTable={setSelectedTable}
						selectedTable={selectedTable}
					/>
				)}
				{activePanel === 'erd' && <ErdPanel onSelectTable={handleSelectTable} />}
				{activePanel === 'data' && <DataViewerPanel tableName={selectedTable} />}
				{activePanel === 'sql' && <SqlSandboxPanel />}
			</Suspense>
		</div>
	);
}

export { DatabaseTab };
