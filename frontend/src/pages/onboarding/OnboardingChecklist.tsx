import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { Link } from 'react-router';

import type { OnboardingStep } from '@/api/onboarding';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface OnboardingChecklistProps {
	steps: OnboardingStep[];
}

/**
 * The page's primary object: the list of setup steps and how far through them the app is.
 *
 * Two things here are not visible on screen. The title renders as a real `h2` through
 * `CardTitle asChild`, because as a `div` it was missing from the document outline entirely — a
 * screen reader navigating this page by heading went from the page title straight past the
 * checklist. And each row carries an `sr-only` status word: completion was encoded only as an
 * `aria-hidden` icon plus `line-through`, so a listener heard "Sign in as administrator" and "Add
 * team members" as indistinguishable items with no way to tell which was done.
 *
 * The page-level Reset / Complete buttons used to sit in this card's footer. They belong to the
 * page, not to the checklist, so they moved to the `PageHeader` action slot and the footer went
 * with them — which is also why the component no longer takes an `action` prop.
 */
function OnboardingChecklist({ steps }: OnboardingChecklistProps) {
	const completedCount = steps.filter((s) => s.completed).length;
	const totalCount = steps.length;
	const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Setup Checklist</CardTitle>
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
									className="mt-0.5 size-5 shrink-0 text-primary"
								/>
							) : (
								<Circle
									aria-hidden="true"
									className="mt-0.5 size-5 shrink-0 text-muted-foreground"
								/>
							)}
							{/*
							 * `justify-between` gives the card a scannable action column at the right
							 * edge. The step action used to be glued to the title, ~230px into a
							 * 1472px row, so the remaining ~1200px of every row was empty and no two
							 * actions lined up with each other.
							 */}
							<div className="flex min-w-0 flex-1 items-start justify-between gap-4">
								<div className="min-w-0">
									<span
										className={
											step.completed
												? 'font-medium text-muted-foreground line-through'
												: 'font-medium'
										}>
										<span className="sr-only">
											{step.completed ? 'Completed: ' : 'Not started: '}
										</span>
										{step.title}
									</span>
									<p className="text-sm text-muted-foreground">
										{step.description}
									</p>
								</div>
								{!step.completed && (
									/*
									 * A button, not a 14px text link: this is the action the page
									 * exists to get done, and it was the quietest thing in the card.
									 * `ArrowRight` rather than `ExternalLink` — every step link is an
									 * in-app route, so the outbound glyph promised a context switch
									 * that never happened. The `sr-only` suffix keeps each accessible
									 * name unique; a run of identically-named "Continue" links tells
									 * a listener nothing about which step each belongs to.
									 */
									<Button asChild size="sm" variant="outline">
										<Link to={step.link}>
											Continue
											<span className="sr-only"> — {step.title}</span>
											<ArrowRight aria-hidden="true" className="size-4" />
										</Link>
									</Button>
								)}
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
