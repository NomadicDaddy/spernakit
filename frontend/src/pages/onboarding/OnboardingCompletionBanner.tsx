import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFormatters } from '@/hooks/useFormatters';

function OnboardingCompletionBanner({
	completedAt,
	isResetPending,
	onReset,
	showReset,
}: {
	completedAt: null | string | undefined;
	isResetPending: boolean;
	onReset: () => void;
	showReset: boolean;
}) {
	const { formatDate } = useFormatters();
	return (
		/*
		 * Green, not blue. This banner says one thing — setup is done — and it said it in the same
		 * blue the sidebar wordmark, the progress fill and every navigable tile on the page use, so
		 * the app's one "you are finished" signal was indistinguishable from brand. The tint moved
		 * with the glyph rather than only the glyph: a green check inside a blue-washed card is less
		 * coherent than the all-blue version it replaced. `success` is the same token the completed
		 * step marks in OnboardingChecklist now use, and the same one SecurityHealthSection and the
		 * scheduler's StatusIcon already reserve for state.
		 */
		<Card className="border-success/20 bg-success/5">
			<CardContent className="flex items-center gap-3">
				<CheckCircle2 aria-hidden="true" className="size-6 shrink-0 text-success" />
				<div className="flex-1">
					<p className="font-medium">Onboarding Complete</p>
					<p className="text-sm text-muted-foreground">
						Completed on {completedAt ? formatDate(completedAt) : 'unknown date'}
					</p>
				</div>
				{showReset && (
					<Button disabled={isResetPending} onClick={onReset} size="sm" variant="outline">
						Reset
					</Button>
				)}
			</CardContent>
		</Card>
	);
}

export { OnboardingCompletionBanner };
