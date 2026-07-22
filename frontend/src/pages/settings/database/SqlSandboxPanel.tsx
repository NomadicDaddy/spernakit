import { useMutation } from '@tanstack/react-query';
import { Download, Play } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { executeQuery } from '@/api/databaseAdmin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { exportTableData } from '@/lib/tableExport';

import { SqlResultsTable } from './SqlResultsTable';

/** Tokens accepted as the leading keyword for a read-only query in safe mode. */
const READ_ONLY_LEADING_TOKENS = new Set(['SELECT', 'WITH', 'EXPLAIN']);

/**
 * Extract the first SQL token (keyword) from a query after stripping comments.
 * Returns the uppercased keyword or an empty string when none found.
 */
function extractLeadingToken(sql: string): string {
	const stripped = sql
		.replace(/--[^\n]*/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.trim();
	const match = /^([A-Za-z_]+)/.exec(stripped);
	return match?.[1] ? match[1].toUpperCase() : '';
}

function SqlSandboxPanel() {
	const [sql, setSql] = useState('');
	const [safeMode, setSafeMode] = useState(true);
	const [error, setError] = useState<null | string>(null);
	const [resultColumns, setResultColumns] = useState<string[]>([]);
	const [resultRows, setResultRows] = useState<Record<string, unknown>[]>([]);
	const [rowCount, setRowCount] = useState<null | number>(null);

	const queryMutation = useMutation({
		mutationFn: (sqlInput: string) => executeQuery(sqlInput),
		onError: (err: Error) => {
			setError(err.message.slice(0, 200));
			setResultColumns([]);
			setResultRows([]);
			setRowCount(null);
		},
		onSuccess: (response) => {
			setError(null);
			setResultColumns(response.data.columns);
			setResultRows(response.data.rows);
			setRowCount(response.data.rowCount);
		},
	});

	function handleExecute() {
		if (!sql.trim()) return;
		if (safeMode) {
			const leading = extractLeadingToken(sql);
			if (!READ_ONLY_LEADING_TOKENS.has(leading)) {
				toast.error('Safe mode is ON - write queries blocked');
				setError(
					'Safe mode is ON. Only SELECT, WITH, and EXPLAIN queries are allowed. ' +
						'Toggle Safe Mode off to run write queries.'
				);
				setResultColumns([]);
				setResultRows([]);
				setRowCount(null);
				return;
			}
		}
		queryMutation.mutate(sql);
	}

	function handleExport(format: 'csv' | 'json') {
		exportTableData(resultRows, resultColumns, 'query-result', format);
	}

	return (
		<div className="space-y-4">
			{/* Query input */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">SQL Query</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div
						className="flex items-center justify-between rounded-md border p-3"
						title="Safe mode blocks non-SELECT queries client-side before sending to the server.">
						<div className="space-y-0.5">
							<Label htmlFor="sql-safe-mode">Safe Mode</Label>
							<p className="text-muted-foreground text-xs">
								Block write queries (INSERT, UPDATE, DELETE, etc.) before execution
							</p>
						</div>
						<Switch
							checked={safeMode}
							id="sql-safe-mode"
							onCheckedChange={setSafeMode}
						/>
					</div>
					<Label className="sr-only" htmlFor="sql-query">
						SQL query
					</Label>
					<Textarea
						autoComplete="off"
						className="font-mono text-sm"
						id="sql-query"
						maxLength={4096}
						onChange={(e) => setSql(e.target.value)}
						placeholder="SELECT * FROM users LIMIT 10"
						rows={5}
						value={sql}
					/>

					{error && (
						<p aria-live="polite" className="text-destructive text-sm" role="alert">
							{error}
						</p>
					)}

					<div className="flex items-center gap-2">
						<Button
							disabled={!sql.trim() || queryMutation.isPending}
							onClick={handleExecute}
							size="sm">
							<Play className="mr-1.5 h-4 w-4" />
							{queryMutation.isPending ? 'Executing…' : 'Execute'}
						</Button>

						{resultRows.length > 0 && (
							<>
								<Button
									onClick={() => handleExport('csv')}
									size="sm"
									variant="outline">
									<Download className="mr-1.5 h-4 w-4" />
									CSV
								</Button>
								<Button
									onClick={() => handleExport('json')}
									size="sm"
									variant="outline">
									<Download className="mr-1.5 h-4 w-4" />
									JSON
								</Button>
							</>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Results */}
			{rowCount !== null && (
				<SqlResultsTable columns={resultColumns} rowCount={rowCount} rows={resultRows} />
			)}
		</div>
	);
}

export { SqlSandboxPanel };
