import { useQuery } from '@tanstack/react-query';
import { Cog, ScrollText } from 'lucide-react';
import { Link } from 'react-router';

import type { AuditLog, PaginatedResponse } from '@/api/types';

import { listAuditLogs } from '@/api/audit';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormatters } from '@/hooks/useFormatters';
import { parseAuditAction } from '@/lib/auditAction';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const RECENT_LIMIT = 6;

/**
 * Derive up to two uppercase initials from a username for the avatar bubble.
 *
 * Returns null for a platform-authored entry rather than an em-dash. The row already names that
 * actor "System"; an em-dash chip next to it said "missing value" about a value that is present.
 */
function initials(name: null | string): null | string {
	if (!name) return null;
	const parts = name
		.trim()
		.split(/[\s._-]+/)
		.filter(Boolean);
	if (parts.length === 0) return null;
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
					<CardTitle>Recent activity</CardTitle>
					<CardDescription>Latest audit events in this workspace</CardDescription>
				</div>
				{/*
				 * Named for what it opens. This card and Active alerts beside it both linked
				 * "View all", so the accessibility tree held two links with identical accessible
				 * names going to different pages. The visible text stays short.
				 */}
				<Link
					aria-label="View all audit logs"
					className="text-sm font-medium text-primary hover:underline"
					to="/settings/audit-logs">
					View all
				</Link>
			</CardHeader>
			<CardContent className="flex-1">
				{isLoading ? (
					<p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
				) : entries.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
						<ScrollText aria-hidden="true" className="size-6 opacity-60" />
						No recent activity to show.
					</div>
				) : (
					<ul className="-my-2 divide-y divide-border/60">
						{entries.map((entry) => {
							const chip = initials(entry.username);
							const { method, path, variant } = parseAuditAction(entry.action);
							return (
								<li className="flex items-center gap-3 py-2.5" key={entry.id}>
									<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
										{chip ?? <Cog aria-hidden="true" className="size-4" />}
									</span>
									<div className="min-w-0 flex-1">
										{/*
										 * The same treatment /settings/audit-logs gives the same
										 * field: verb in a Badge, path in muted mono, and the
										 * username as the row's only bold anchor. This used to be
										 * one undifferentiated run of text with two bold anchors
										 * in it — "sysop POST /api/v1/... business-metrics" — so
										 * identical records read as two different data models on
										 * two surfaces.
										 */}
										<div className="flex min-w-0 items-center gap-1.5 text-sm">
											<span className="shrink-0 font-medium">
												{entry.username ?? 'System'}
											</span>
											{method && (
												<Badge className="shrink-0" variant={variant}>
													{method}
												</Badge>
											)}
											<span className="truncate font-mono text-xs text-muted-foreground">
												{path}
											</span>
											{entry.resource && (
												<span className="shrink-0 text-xs text-muted-foreground">
													{entry.resource}
												</span>
											)}
										</div>
										<p className="truncate text-xs text-muted-foreground">
											{formatTimestamp(entry.createdAt)}
											{entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
										</p>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

export { RecentActivity };
