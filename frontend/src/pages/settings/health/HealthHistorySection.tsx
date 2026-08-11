import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { useFormatters } from '@/hooks/useFormatters';

import { statusBadgeVariant } from './healthStatusUtils';
import { StatusGlyph } from './StatusGlyph';

/** How many of the 50 results are shown before the operator asks for the rest. */
const COLLAPSED_ROWS = 10;

interface HealthHistoryRow {
	checkType: string;
	createdAt: string;
	durationMs: null | number;
	id: number;
	status: string;
}

interface HealthHistorySectionProps {
	historyData: { history: unknown[] } | undefined;
	historyLoading: boolean;
}

export function HealthHistorySection({ historyData, historyLoading }: HealthHistorySectionProps) {
	const { formatDateTime } = useFormatters();
	const [expanded, setExpanded] = useState(false);

	const entries = (historyData?.history ?? []) as HealthHistoryRow[];
	const visible = expanded ? entries : entries.slice(0, COLLAPSED_ROWS);

	return (
		<Card>
			<CardHeader>
				<CardTitle as="h3">Recent History</CardTitle>
				<CardDescription>
					{entries.length > 0
						? `The last ${entries.length} health check results.`
						: 'Last 50 health check results.'}
				</CardDescription>
				{/*
				 * The list used to live in its own `max-h-64` scroller nested inside the page
				 * scroller, so seven of the advertised fifty were visible and the other
				 * forty-three needed a second gesture inside a card that showed no scroll
				 * affordance. Ten rows and a labelled control instead — the disclosure is now
				 * something you can see.
				 */}
				{entries.length > COLLAPSED_ROWS && (
					<CardAction>
						<Button onClick={() => setExpanded((v) => !v)} size="sm" variant="ghost">
							{expanded ? 'Show fewer' : `Show all ${entries.length}`}
						</Button>
					</CardAction>
				)}
			</CardHeader>
			<CardContent className="px-0">
				{historyLoading ? (
					<Skeleton className="mx-6 h-40" />
				) : entries.length > 0 ? (
					/*
					 * The shared table rather than hand-rolled flex rows. Without headers the bare
					 * `0ms` and `08/10/2026 10:36` sat unlabelled at opposite ends of a row with
					 * ~750px of nothing between them; Duration and Started now have their own
					 * right-aligned column and read down the page as columns.
					 */
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Check</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Duration</TableHead>
								<TableHead className="text-right">Started</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visible.map((entry) => {
								return (
									<TableRow key={entry.id}>
										<TableCell className="capitalize">
											{entry.checkType}
										</TableCell>
										<TableCell>
											{/* One status mark per row, as on the check cards above. */}
											<Badge variant={statusBadgeVariant(entry.status)}>
												<StatusGlyph status={entry.status} />
												{entry.status}
											</Badge>
										</TableCell>
										<TableCell className="text-right text-muted-foreground tabular-nums">
											{entry.durationMs !== null
												? `${entry.durationMs}ms`
												: '—'}
										</TableCell>
										<TableCell className="text-right text-muted-foreground">
											{formatDateTime(entry.createdAt)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				) : (
					<p className="px-6 text-sm text-muted-foreground">
						No health check history yet. Click Refresh to run checks.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
