import { Activity } from 'lucide-react';

import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormatters } from '@/hooks/useFormatters';

import { statusBadgeVariant } from './healthStatusUtils';
import { StatusGlyph } from './StatusGlyph';

interface HealthStatusSectionProps {
	details: { status: string; timestamp: string } | undefined;
	detailsLoading: boolean;
}

export function HealthStatusSection({ details, detailsLoading }: HealthStatusSectionProps) {
	const { formatDateTime } = useFormatters();

	return (
		<>
			{detailsLoading ? (
				<ContentListSkeleton lineCount={1} lineHeight="h-16" />
			) : details?.status ? (
				/*
				 * A titled card, not a bare strip. Every other single-panel section on this page
				 * announces itself with a CardTitle; this one used to label itself with a plain
				 * `text-sm font-medium` paragraph inside the body, which made it the only
				 * grouping on the page that carried no heading at all.
				 */
				<Card className="py-4">
					<CardHeader className="px-4">
						<CardTitle as="h3" className="flex items-center gap-2">
							<Activity aria-hidden="true" className="size-5" />
							Overall Status
						</CardTitle>
						{/*
						 * The only raw ISO string on the surface: this printed
						 * `2026-08-10T15:36:18.629Z` — UTC, millisecond precision — while the
						 * history rows 1700px below printed the same instant as `08/10/2026 10:36`
						 * in local time. Same formatter as the rest of the page now.
						 */}
						<CardDescription>
							Last checked {formatDateTime(details.timestamp)}
						</CardDescription>
						<CardAction>
							{/*
							 * The glyph its four subordinates already carry. This was the only one of
							 * fifteen status badges on the surface — one here, four on CheckCard, ten
							 * in the history table — rendering as bare text, so the page's single most
							 * important status indicator was the only one whose meaning rested on
							 * colour alone while every lesser one carried a non-colour mark too.
							 */}
							<Badge variant={statusBadgeVariant(details.status)}>
								<StatusGlyph status={details.status} />
								{details.status}
							</Badge>
						</CardAction>
					</CardHeader>
				</Card>
			) : null}
		</>
	);
}
