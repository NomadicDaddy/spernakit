import type { LucideIcon } from 'lucide-react';

import { ChevronRight, Gauge, LayoutGrid, Server, ShieldCheck, Users } from 'lucide-react';

import type { DashboardTemplate } from '@/api/dashboards';

import { Badge } from '@/components/ui/badge';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

interface TemplateDashboardDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	templateMutation: { isPending: boolean; mutate: (id: string) => void };
	templates: DashboardTemplate[];
}

/**
 * One glyph per template id, so a picker of four rows has four visual anchors.
 *
 * The rows previously carried a name and a widget count and nothing else — four near-identical
 * grey slabs where the only differentiating datum was rendered as muted body text. Ids come from
 * `DASHBOARD_TEMPLATES` in the backend template service; an unmapped id falls back to the generic
 * dashboard glyph rather than to a blank tile.
 */
const TEMPLATE_ICONS: Record<string, LucideIcon> = {
	api_performance: Gauge,
	security: ShieldCheck,
	system_overview: Server,
	user_activity: Users,
};

/**
 * What each template actually puts on the board, in one line.
 *
 * A row is 464px of content width and the icon tile, name and badge occupied roughly the outer
 * 200px of it — the middle ~230px was empty on all four. The only datum offered to choose by was
 * the widget count pinned to the right edge, and two of the four rows read the identical "5
 * widgets", so for half the picker the number differentiated nothing. A dialog that asks the user
 * to choose a template has to say what the templates contain.
 *
 * Summarised from each entry's widget list in `DASHBOARD_TEMPLATES` (backend
 * dashboardTemplateService), because the API's `DashboardTemplate` carries only id, name and count.
 * Same fallback discipline as TEMPLATE_ICONS: an unmapped id renders the name alone rather than an
 * empty second line.
 *
 * Kept under ~45 characters. The line gets 286px inside a 512px dialog, and the first pass at these
 * ("Request and connection counts, CPU and memory gauges", 331px) ellipsed on all four rows — a
 * truncated summary answers less than a short one and costs the same height.
 */
const TEMPLATE_SUMMARIES: Record<string, string> = {
	api_performance: 'Request, connection, CPU and memory load',
	security: 'Audit events, users, health and alerts',
	system_overview: 'CPU, memory, requests, health and alerts',
	user_activity: 'Users, connections and event volume',
};

/**
 * Template dashboard dialog component.
 */
export function TemplateDashboardDialog({
	isOpen,
	onOpenChange,
	templateMutation,
	templates,
}: TemplateDashboardDialogProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create from Template</DialogTitle>
					{/*
					 * The description names the outcome, because nothing else on the dialog does.
					 * Its footer holds a Close button in the exact slot where the Create Dashboard
					 * dialog — opened from the button 100px to its left — holds a primary "Create",
					 * so the picker shows an action row containing no action while the controls
					 * that actually create a dashboard are the flat bordered rows in the body. Two
					 * dialogs from adjacent header buttons taught opposite lessons about where the
					 * commit lives. "start with" said the rows were a starting point; "create the
					 * dashboard now" says clicking one commits.
					 */}
					<DialogDescription>
						Pick a template to create the dashboard now. You can customize it after.
					</DialogDescription>
				</DialogHeader>
				{/*
				 * No `py-4` here. DialogContent's own `gap-4` already spaces header, body and
				 * footer; the extra padding stacked on top of it left a 41px dead band under the
				 * last option, wider than the panel's own 24px inset.
				 */}
				<div className="space-y-2">
					{templates?.map((t) => {
						const Icon = TEMPLATE_ICONS[t.id] ?? LayoutGrid;
						const summary = TEMPLATE_SUMMARIES[t.id];
						return (
							/*
							 * The app focus treatment, explicitly. Radix autofocuses the first row
							 * on open, and with no focus-visible classes these fell through to
							 * Chrome's UA `outline: auto` — a hard white ring that read as a
							 * pre-selected item rather than as keyboard focus.
							 */
							<button
								className="flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								disabled={templateMutation?.isPending}
								key={t.id}
								onClick={() => {
									templateMutation.mutate(t.id);
									onOpenChange(false);
								}}
								type="button">
								<span
									aria-hidden="true"
									className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-primary">
									<Icon className="size-4" />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-medium">
										{t.name}
									</span>
									{summary && (
										<span className="block truncate text-xs text-muted-foreground">
											{summary}
										</span>
									)}
								</span>
								<Badge variant="secondary">{t.widgetCount} widgets</Badge>
								{/*
								 * The trailing affordance the row was missing. Nothing on it
								 * distinguished "clicking this creates and opens a dashboard" from
								 * "this is a list entry describing a template" — no verb, no filled
								 * treatment, no chevron. Same glyph and muted token the PageHeader
								 * breadcrumbs already use for "this leads somewhere".
								 */}
								<ChevronRight
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground"
								/>
							</button>
						);
					})}
				</div>
				{/*
				 * Both dialogs on this page now have the same header/body/footer anatomy. Without
				 * a footer the only way out of the picker was the 16px X in the corner, while the
				 * Create Dashboard dialog opened from the adjacent button showed a full Cancel.
				 */}
				<DialogFooter showCloseButton />
			</DialogContent>
		</Dialog>
	);
}
