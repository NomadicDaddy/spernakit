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
		<Card className="border-primary/20 bg-primary/5">
			<CardContent className="flex items-center gap-3">
				<CheckCircle2 aria-hidden="true" className="size-6 shrink-0 text-primary" />
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
