import { useMutation } from '@tanstack/react-query';
import { Download, Play } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { executeQuery } from '@/api/databaseAdmin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { exportTableData } from '@/lib/tableExport';
import { SettingsToggleRow } from '@/pages/settings/SettingsToggleRow';

import { SqlResultsTable } from './SqlResultsTable';

/** Tokens accepted as the leading keyword for a read-only query in safe mode. */
const READ_ONLY_LEADING_TOKENS = new Set(['EXPLAIN', 'SELECT', 'WITH']);

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
						'Toggle Safe Mode off to run write queries.',
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
			{/*
			 * The card is capped, not just its contents. The mobile pass moved the reading measure up
			 * to CardContent so the toggle, the field and the button row finally shared one right
			 * edge — but the Card itself still ran the full 1472px at 2560, so the 53% of its interior
			 * that no control reached was dead charcoal for the card's whole 392px height rather than
			 * page gutter. `max-w-3xl` is 48px of slack around the `max-w-2xl` measure the content
			 * already commits to. The results card below is deliberately left uncapped: it holds a
			 * table, and a table wants every pixel it can get.
			 */}
			<Card className="max-w-3xl">
				<CardHeader className="pb-3">
					<CardTitle>SQL Query</CardTitle>
				</CardHeader>
				{/*
				 * The measure belongs to the column, not to the textarea alone. It was on the
				 * Textarea only, so at 2560 the query field stopped at x=1297 while the Safe Mode
				 * switch sat at x=2104 and the button row's container ran the same 1422px — one card
				 * with three different right edges and 807px of nothing between the toggle and the
				 * field it governs. `max-w-2xl` is the cap the authentication field grids already
				 * use; in the textarea's `font-mono text-sm` face it comes to about 87 columns,
				 * near enough to the 80 the old `max-w-[80ch]` asked for and a house token rather
				 * than a per-control one.
				 */}
				<CardContent className="max-w-2xl space-y-3">
					{/*
					 * The shared settings row rather than the same markup plus a border, which made
					 * a card inside a card at the top of this one. The explanation it used to carry
					 * as a native `title` — invisible to the keyboard — is the description slot.
					 */}
					<SettingsToggleRow
						checked={safeMode}
						description="Block write queries (INSERT, UPDATE, DELETE, etc.) before execution"
						id="sql-safe-mode"
						label="Safe Mode"
						onCheckedChange={setSafeMode}
					/>
					<Label className="sr-only" htmlFor="sql-query">
						SQL query
					</Label>
					{/*
					 * `rows` never applied: the shared Textarea's `min-h-16` and `field-sizing:
					 * content` overrode it, so a five-line request rendered 64px — two lines of the
					 * monospace face. The readable-measure cap that used to live here moved up to
					 * CardContent so the toggle above and the buttons below share this field's right
					 * edge; at full card width a query ran to about 170 characters per line.
					 */}
					<Textarea
						autoCapitalize="off"
						autoComplete="off"
						autoCorrect="off"
						className="min-h-48 font-mono text-sm"
						id="sql-query"
						maxLength={4096}
						onChange={(e) => setSql(e.target.value)}
						placeholder="SELECT * FROM users LIMIT 10"
						// Identifiers like `sqlite_master` got a red wavy underline, which on a dark
						// monospace field reads as a validation error on a valid query.
						spellCheck={false}
						value={sql}
					/>

					{error && (
						<p aria-live="polite" className="text-sm text-destructive" role="alert">
							{error}
						</p>
					)}

					<div className="flex items-center gap-2">
						<Button
							disabled={!sql.trim() || queryMutation.isPending}
							onClick={handleExecute}
							size="sm">
							<Play className="h-4 w-4" />
							{queryMutation.isPending ? 'Executing…' : 'Execute'}
						</Button>

						{resultRows.length > 0 && (
							<>
								<Button
									onClick={() => handleExport('csv')}
									size="sm"
									variant="outline">
									<Download className="h-4 w-4" />
									CSV
								</Button>
								<Button
									onClick={() => handleExport('json')}
									size="sm"
									variant="outline">
									<Download className="h-4 w-4" />
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
