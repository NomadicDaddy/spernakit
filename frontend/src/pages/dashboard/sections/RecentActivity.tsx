import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AuditLog, PaginatedResponse } from '@/api/types';

import { listAuditLogs } from '@/api/audit';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormatters } from '@/hooks/useFormatters';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const RECENT_LIMIT = 6;

/** Derive up to two uppercase initials from a username for the avatar bubble. */
function initials(name: null | string): string {
	if (!name) return '—';
	const parts = name
		.trim()
		.split(/[\s._-]+/)
		.filter(Boolean);
	if (parts.length === 0) return '—';
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function RecentActivity({
	canUseGlobalScope = false,
	className,
}: {
	/** SYSOPs read audit logs across all workspaces, so the query can run without a selected workspace. */
	canUseGlobalScope?: boolean;
	className?: string;
}) {
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
	const { formatTimestamp } = useFormatters();

	const { data, isLoading } = useQuery<PaginatedResponse<AuditLog>>({
		enabled: canUseGlobalScope || activeWorkspaceId !== null,
		queryFn: () => listAuditLogs({ limit: String(RECENT_LIMIT), page: '1' }),
		queryKey: ['audit-logs', 'dashboard-recent', activeWorkspaceId],
		staleTime: 30_000,
		throwOnError: false,
	});

	const entries = data?.data ?? [];

	return (
		<Card className={cn('flex flex-col', className)}>
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<div className="space-y-1">
					<CardTitle className="text-base">Recent activity</CardTitle>
					<CardDescription>Latest audit events in this workspace</CardDescription>
				</div>
				<Link
					className="text-primary text-sm font-medium hover:underline"
					to="/settings/audit-logs">
					View all
				</Link>
			</CardHeader>
			<CardContent className="flex-1">
				{isLoading ? (
					<p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
				) : entries.length === 0 ? (
					<div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
						<ScrollText aria-hidden="true" className="size-6 opacity-60" />
						No recent activity to show.
					</div>
				) : (
					<ul className="divide-border/60 -my-2 divide-y">
						{entries.map((entry) => (
							<li className="flex items-center gap-3 py-2.5" key={entry.id}>
								<span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
									{initials(entry.username)}
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm">
										<span className="font-medium">
											{entry.username ?? 'System'}
										</span>{' '}
										<span className="text-muted-foreground">
											{entry.action}
										</span>
										{entry.resource && (
											<>
												{' '}
												<span className="font-medium">
													{entry.resource}
												</span>
											</>
										)}
									</p>
									<p className="text-muted-foreground truncate text-xs">
										{formatTimestamp(entry.createdAt)}
										{entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
									</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

export { RecentActivity };
