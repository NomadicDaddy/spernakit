import type { ReactNode } from 'react';

import { CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';

import type { OnboardingStep } from '@/api/onboarding';

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

interface OnboardingChecklistProps {
	action?: ReactNode;
	steps: OnboardingStep[];
}

function OnboardingChecklist({ action, steps }: OnboardingChecklistProps) {
	const completedCount = steps.filter((s) => s.completed).length;
	const totalCount = steps.length;
	const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">Setup Checklist</CardTitle>
				<CardDescription>
					{completedCount} of {totalCount} steps completed ({progressPercent}%)
				</CardDescription>
				<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
					<div
						className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-500"
						style={{ transform: `scaleX(${progressPercent / 100})` }}
					/>
				</div>
			</CardHeader>
			<CardContent>
				<ul className="space-y-3">
					{steps.map((step) => (
						<li className="flex items-start gap-3" key={step.id}>
							{step.completed ? (
								<CheckCircle2
									aria-hidden="true"
									className="mt-0.5 h-5 w-5 shrink-0 text-primary"
								/>
							) : (
								<Circle
									aria-hidden="true"
									className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
								/>
							)}
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span
										className={
											step.completed
												? 'font-medium text-muted-foreground line-through'
												: 'font-medium'
										}>
										{step.title}
									</span>
									{!step.completed && (
										<Link
											className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
											to={step.link}>
											Go
											<ExternalLink aria-hidden="true" className="h-3 w-3" />
										</Link>
									)}
								</div>
								<p className="text-sm text-muted-foreground">{step.description}</p>
							</div>
						</li>
					))}
				</ul>
			</CardContent>
			{action && <CardFooter className="justify-end border-t pt-4">{action}</CardFooter>}
		</Card>
	);
}

export { OnboardingChecklist };
export type { OnboardingChecklistProps };
