import { KeyRound, ShieldCheck, UserMinus } from 'lucide-react';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { Card, CardContent } from '@/components/ui/card';

/**
 * A tip tile, built on the same `Card` shell as `QuickStartCard`.
 *
 * It used to be a translucent `rounded-lg bg-muted/50` panel nested inside the Tips card — a third
 * shell for the same icon + 14px title + muted description atom the page already rendered two other
 * ways, and one whose 10px radius and 16px padding did not match the 14px/24px card it sat in. The
 * two tile grids now rhyme, and the page has one boxed object (the checklist) rather than three.
 *
 * The icon is `text-muted-foreground`, not `text-primary`: on this page the primary colour means
 * "this is somewhere to go", and a tip is not navigable. Each tip also gets its own glyph — all
 * three carried the same `BookOpen`, which repeated decoration without differentiating anything.
 */
function TipCard({
	icon: Icon,
	text,
	title,
}: {
	icon: React.ComponentType<{ 'aria-hidden'?: 'false' | 'true' | boolean; className?: string }>;
	text: string;
	title: string;
}) {
	return (
		<Card>
			<CardContent className="flex items-start gap-3">
				<Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
				<div className="min-w-0">
					<p className="text-sm font-medium">{title}</p>
					<p className="text-sm text-muted-foreground">{text}</p>
				</div>
			</CardContent>
		</Card>
	);
}

function OnboardingTips() {
	return (
		<section className="space-y-3">
			<SectionHeader
				description="Helpful guidance as you set up your application."
				title="Tips & Best Practices"
			/>
			{/*
			 * Three across rather than three stacked full-bleed rows. Each tip is a five-word title
			 * and one sentence; at full width the section spent ~366px of page to deliver three
			 * sentences at a measure roughly twice the readable one.
			 */}
			<div className="grid gap-4 md:grid-cols-3">
				<TipCard
					icon={KeyRound}
					text="Change the default sysop password immediately after your first login for security."
					title="Change Default Passwords"
				/>
				<TipCard
					icon={ShieldCheck}
					text="Set up roles and permissions before inviting your team to ensure proper access control."
					title="Set Up Roles First"
				/>
				<TipCard
					icon={UserMinus}
					text="Assign the least-privileged role to each team member. Use VIEWER for read-only access."
					title="Follow Least Privilege"
				/>
			</div>
		</section>
	);
}

export { OnboardingTips };
