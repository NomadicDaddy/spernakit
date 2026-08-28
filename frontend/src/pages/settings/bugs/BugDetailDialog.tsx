import { useQuery } from '@tanstack/react-query';

import type { BugReport, DataResponse } from '@/api/types';

import { getBug } from '@/api/bugs';
import { Badge } from '@/components/ui/badge';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { useFormatters } from '@/hooks/useFormatters';

import { BugLinks } from './BugLinks';
import { KIND_LABEL, KIND_VARIANT, STATUS_LABEL, STATUS_VARIANT } from './bugMeta';
import { SupersedeControl } from './SupersedeControl';

interface BugDetailDialogProps {
	bugId: null | number;
	onOpenChange: (open: boolean) => void;
	/** Follow a supersede link to the report on the other end of it. */
	onOpenReport: (id: number) => void;
}

/**
 * Metadata entries worth showing, in the order they are useful for triage.
 *
 * The capture in lib/bugReport.ts also stores an array of localStorage keys and the server adds a
 * `reportedBy` object; neither renders as a line of text, and both are left out rather than
 * stringified into noise.
 */
const META_ORDER = [
	'url',
	'pathname',
	'userAgent',
	'viewportSize',
	'screenResolution',
	'theme',
	'timezone',
	'language',
	'timestamp',
];

function scalarMetadata(metadata: null | Record<string, unknown>): [string, string][] {
	if (!metadata) return [];
	const seen = new Set(META_ORDER);
	const keys = [
		...META_ORDER,
		...Object.keys(metadata)
			.filter((key) => !seen.has(key))
			.sort(),
	];
	const rows: [string, string][] = [];
	for (const key of keys) {
		const value = metadata[key];
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			rows.push([key, String(value)]);
		}
	}
	return rows;
}

/**
 * Full text of one submission.
 *
 * The table clamps every description to two lines, which is deliberate — see the comment on the
 * Description column in useBugColumns.tsx — but left a report of any length unreadable anywhere in
 * the app. A triage queue that cannot show what was reported is not a triage queue, so the clamped
 * cell opens this instead.
 *
 * It takes an id and fetches rather than taking the row the table already has, because following a
 * supersede link has to work in the direction the listing cannot answer: a superseded report is
 * left out of the default page, so the report that replaced it can name a number that is nowhere
 * on screen.
 */
function BugDetailDialog({ bugId, onOpenChange, onOpenReport }: BugDetailDialogProps) {
	const { formatDateTime } = useFormatters();

	const { data, isLoading } = useQuery<DataResponse<BugReport>>({
		enabled: bugId !== null,
		queryFn: () => getBug(bugId ?? 0),
		queryKey: ['bug', bugId],
	});

	const bug = bugId === null ? null : (data?.data ?? null);
	const reportedBy = bug?.metadata?.reportedBy as { username?: string } | undefined;

	return (
		<Dialog onOpenChange={onOpenChange} open={bugId !== null}>
			{/*
			  Capped and row-templated for the same reason BugReportButton's dialog is: the
			  description is up to 5,000 characters, so the body has to be the part that scrolls
			  rather than the dialog growing past the bottom of a window that cannot scroll.
			*/}
			<DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-2xl">
				{bug ? (
					<>
						<DialogHeader>
							<DialogTitle className="flex flex-wrap items-center gap-2">
								<span className="font-mono text-sm text-muted-foreground">
									#{bug.id}
								</span>
								<Badge variant={KIND_VARIANT[bug.kind]}>
									{KIND_LABEL[bug.kind]}
								</Badge>
								<Badge variant={STATUS_VARIANT[bug.status]}>
									{STATUS_LABEL[bug.status]}
								</Badge>
								{bug.supersededById === null ? null : (
									<Badge variant="outline">Superseded</Badge>
								)}
							</DialogTitle>
							<DialogDescription>
								Reported by {reportedBy?.username ?? 'an unidentified user'}
								{bug.email ? ` (${bug.email})` : ''} on{' '}
								{formatDateTime(bug.createdAt)}.
							</DialogDescription>
						</DialogHeader>
						<div className="min-h-0 space-y-6 overflow-y-auto">
							<p className="text-sm break-words whitespace-pre-wrap">
								{bug.description}
							</p>
							{bug.supersededById === null &&
							bug.supersedesIds.length === 0 ? null : (
								<div className="space-y-2">
									<h3 className="text-xs font-medium text-muted-foreground uppercase">
										Related reports
									</h3>
									<BugLinks bug={bug} onOpenReport={onOpenReport} />
								</div>
							)}
							<SupersedeControl bug={bug} />
							{scalarMetadata(bug.metadata).length > 0 ? (
								<div className="space-y-2">
									<h3 className="text-xs font-medium text-muted-foreground uppercase">
										Captured details
									</h3>
									<dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
										{scalarMetadata(bug.metadata).map(([key, value]) => (
											<div className="contents" key={key}>
												<dt className="text-muted-foreground">{key}</dt>
												<dd className="break-all">{value}</dd>
											</div>
										))}
									</dl>
								</div>
							) : null}
						</div>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Report</DialogTitle>
							<DialogDescription>
								{isLoading
									? 'Loading the report…'
									: 'That report could not be loaded.'}
							</DialogDescription>
						</DialogHeader>
						<div />
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

export { BugDetailDialog };
