import { CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { OnboardingStep } from '@/api/onboarding';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface OnboardingChecklistProps {
	steps: OnboardingStep[];
}

function OnboardingChecklist({ steps }: OnboardingChecklistProps) {
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
				<div className="bg-muted mt-2 h-2 w-full overflow-hidden rounded-full">
					<div
						className="bg-primary h-full w-full origin-left rounded-full transition-transform duration-500"
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
									className="text-primary mt-0.5 h-5 w-5 shrink-0"
								/>
							) : (
								<Circle
									aria-hidden="true"
									className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0"
								/>
							)}
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span
										className={
											step.completed
												? 'text-muted-foreground font-medium line-through'
												: 'font-medium'
										}>
										{step.title}
									</span>
									{!step.completed && (
										<Link
											className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
											to={step.link}>
											Go
											<ExternalLink aria-hidden="true" className="h-3 w-3" />
										</Link>
									)}
								</div>
								<p className="text-muted-foreground text-sm">{step.description}</p>
							</div>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}

export { OnboardingChecklist };
export type { OnboardingChecklistProps };
