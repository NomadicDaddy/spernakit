import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface DashboardEmptyWidgetsProps {
	canMutate: boolean;
	editMode: boolean;
	onAddWidgetClick: () => void;
}

/**
 * What a dashboard with no widgets shows. The copy depends on what the viewer can actually do next:
 * an operator in edit mode is told to add one, an operator not in edit mode is told how to get
 * there, and a viewer who cannot mutate is told the state without being offered an action they
 * would be refused.
 */
function DashboardEmptyWidgets({
	canMutate,
	editMode,
	onAddWidgetClick,
}: DashboardEmptyWidgetsProps) {
	return (
		<Card>
			<CardContent className="flex flex-col items-center justify-center py-12">
				<Plus aria-hidden="true" className="mb-4 size-12 text-muted-foreground" />
				<h2 className="text-lg font-semibold">No widgets yet</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{canMutate
						? editMode
							? 'Add a widget to start building your dashboard.'
							: 'Switch to edit mode and add widgets to your dashboard.'
						: 'This dashboard has no widgets yet.'}
				</p>
				{canMutate && (
					<Button className="mt-4" onClick={onAddWidgetClick} size="sm">
						<Plus aria-hidden="true" className="size-4" />
						Add Widget
					</Button>
				)}
			</CardContent>
		</Card>
	);
}

export { DashboardEmptyWidgets };
