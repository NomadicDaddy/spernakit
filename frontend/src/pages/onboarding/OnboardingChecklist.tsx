import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { Link } from 'react-router';

import type { OnboardingStep } from '@/api/onboarding';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

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
	/*
	 * Which row gets the page's one blue button. Nothing on this page used the primary variant at
	 * all: "Reset Onboarding" in the header slot and "Continue" in the card were both
	 * `variant="outline"`, so the undo action sat in the slot /settings/users gives to "Add User"
	 * and carried the same weight as the action the page exists to get done. One primary per
	 * screen, and it belongs on the next thing to do — the first step still outstanding. Later
	 * steps stay `outline`: they are the same action, but they are not next.
	 */
	const nextStepId = steps.find((s) => !s.completed)?.id;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Setup Checklist</CardTitle>
				<CardDescription>
					{completedCount} of {totalCount} steps completed ({progressPercent}%)
				</CardDescription>
				{/*
				 * The shared `Progress`, not two hand-rolled divs. The local pair drew its track from
				 * `bg-muted` where `components/ui/progress.tsx` uses `bg-primary/20` — a grey bar on
				 * a page whose every other proportion indicator is blue-tinted — and it carried no
				 * `role="progressbar"`, so the one element on screen stating how far through setup
				 * the app is announced nothing at all. The Radix root supplies the role, the value
				 * and the max; the height, radius and fill are unchanged.
				 */}
				<Progress className="mt-2" value={progressPercent} />
			</CardHeader>
			<CardContent>
				<ul className="space-y-3">
					{steps.map((step) => (
						<li className="flex items-start gap-3" key={step.id}>
							{step.completed ? (
								/*
								 * `text-success`, not `text-primary`. This glyph is the only thing in
								 * the row that encodes state, and it was drawn in the same blue as the
								 * progress fill, the Quick Start icons and the sidebar wordmark — blue
								 * was doing brand, progress, navigation and completion at once, which
								 * left the one state mark reading as decoration. Green for done is what
								 * SecurityHealthSection and the scheduler's StatusIcon already use.
								 */
								<CheckCircle2
									aria-hidden="true"
									className="mt-0.5 size-5 shrink-0 text-success"
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
							 *
							 * That column is a desktop affordance and only exists from `sm` up. This
							 * row was tuned against a ~1472px width; at 390px it is 252px, and the
							 * Continue button claims 104.5px of it plus the 16px gap, leaving the
							 * step title 131px — narrower than most of the titles. Stacking below
							 * `sm` gives the text the full row and puts the action under it, rather
							 * than making both too narrow to read.
							 *
							 * `max-w-3xl` caps how far that column can travel. Stretched to the card
							 * edge it left 1154px of empty row between "Add team members" and the
							 * Continue button that acts on it at 2560 — the page's primary object was
							 * the least dense thing on the screen. 768px keeps the title and
							 * description inside the ~65ch measure the baseline uses for muted copy and
							 * keeps the action within scanning distance of its step, while the actions
							 * still form one right-aligned column that lines up across rows.
							 */}
							<div className="flex max-w-3xl min-w-0 flex-1 flex-col items-start justify-between gap-2 sm:flex-row sm:gap-4">
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
									<Button
										asChild
										size="sm"
										variant={step.id === nextStepId ? 'default' : 'outline'}>
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
