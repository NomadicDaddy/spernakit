import { Download, MoreHorizontal, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import type { DashboardConfig } from '@/api/dashboards';

import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFormatters } from '@/hooks/useFormatters';
import { preloadDashboardRoute } from '@/routes/preload';

interface DashboardCardProps {
	canMutate: boolean;
	dashboard: DashboardConfig;
	onDelete: (id: number) => void;
	onExport: (id: number) => Promise<void>;
}

/**
 * Dashboard card component.
 */
export function DashboardCard({ canMutate, dashboard, onDelete, onExport }: DashboardCardProps) {
	const { formatDate } = useFormatters();
	return (
		/*
		 * `interactive`, not a hand-rolled `hover:shadow-md`. The raw utility resolved to a
		 * 10%-black shadow that beat the `--shadow-card` token's 40/50%-black one, so hovering a
		 * clickable card made it look *less* raised — invisible on this near-black canvas. The
		 * `interactive` prop applies `--shadow-card-hover`, which actually deepens, and brings the
		 * shared 200ms duration with it. Same treatment the QuickStartCard on /onboarding uses.
		 *
		 * The ring is projected onto the shell because the open affordance is a stretched link:
		 * focus was drawn by the UA as a 1px white rectangle around the title text while the card's
		 * own buttons showed the 3px token ring, so the page's primary navigation target had the
		 * weakest focus indicator on it and gave no hint of the real hit area.
		 */
		<Card
			className="relative has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50"
			interactive
			onFocus={preloadDashboardRoute}
			onMouseEnter={preloadDashboardRoute}
			role="listitem">
			<CardHeader>
				<CardTitle>
					<Link
						className="outline-none after:absolute after:inset-0"
						to={`/dashboards/${dashboard.id}`}>
						{dashboard.name}
					</Link>
				</CardTitle>
				{/*
				 * `updatedAt`, not `createdAt`. For a monitoring tool the useful fact about a saved
				 * dashboard is when it last changed; the creation date was the least operational of
				 * the fields the list payload already carries.
				 */}
				<CardDescription>Updated {formatDate(dashboard.updatedAt)}</CardDescription>
				{/*
				 * One labelled menu, the pattern /settings/users uses for per-item actions. Two
				 * permanently-visible unlabelled 36px icon buttons ate 76px of every card's
				 * interior — the direct cause of the title crush at 1024 — and painted a
				 * destructive action in the same card-foreground as a harmless export. The
				 * `CardAction` slot is what makes CardHeader's two-column grid fire, which also
				 * retires the hand-rolled `flex items-start justify-between` wrapper and the
				 * phantom 8px row gap it left under the description.
				 */}
				<CardAction className="relative z-10">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								aria-label={`Actions for ${dashboard.name}`}
								size="icon"
								variant="ghost">
								<MoreHorizontal aria-hidden="true" className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={() => {
									void onExport(dashboard.id);
								}}>
								<Download aria-hidden="true" className="size-4" />
								Export
							</DropdownMenuItem>
							{canMutate && (
								<DropdownMenuItem
									className="text-destructive"
									onClick={() => onDelete(dashboard.id)}>
									<Trash2 aria-hidden="true" className="size-4" />
									Delete
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</CardAction>
			</CardHeader>
		</Card>
	);
}
