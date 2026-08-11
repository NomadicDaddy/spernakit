import type { LucideIcon } from 'lucide-react';

import { Gauge, LayoutGrid, Server, ShieldCheck, Users } from 'lucide-react';

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
					<DialogDescription>
						Choose a pre-built template to start with. You can customize it after
						creation.
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
								<span className="min-w-0 flex-1 truncate text-sm font-medium">
									{t.name}
								</span>
								<Badge variant="secondary">{t.widgetCount} widgets</Badge>
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
