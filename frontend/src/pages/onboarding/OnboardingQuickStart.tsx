import { LayoutDashboard, Shield, Users } from 'lucide-react';
import { Link } from 'react-router';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { Card, CardContent } from '@/components/ui/card';

function QuickStartCard({
	description,
	icon: Icon,
	link,
	title,
}: {
	description: string;
	icon: React.ComponentType<{ 'aria-hidden'?: 'false' | 'true' | boolean; className?: string }>;
	link: string;
	title: string;
}) {
	return (
		/*
		 * The stretched-link focus treatment, kept identical to DashboardCard's. A bare
		 * `after:absolute after:inset-0` link takes the UA's 1px outline around its text run while
		 * the card it covers shows nothing, so the focus indicator described neither the app's ring
		 * nor the actual hit area. Projecting the ring onto the shell fixes both.
		 */
		<Card
			className="relative has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50"
			interactive>
			{/*
			 * No `pt-6`. `Card` in this fork owns the vertical padding (`py-6`) and `CardContent`
			 * owns only the horizontal, so the upstream shadcn `pt-6` was purely additive: 48px
			 * above the icon against 24px below the description, which pinned the content high in
			 * an over-tall tile. See the padding contract at the top of `components/ui/card.tsx`.
			 */}
			<CardContent className="flex items-start gap-3">
				<Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
				<div>
					<p className="font-medium">
						<Link className="outline-none after:absolute after:inset-0" to={link}>
							{title}
						</Link>
					</p>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
			</CardContent>
		</Card>
	);
}

/*
 * The page has exactly one boxed object — the Setup Checklist — and two bare tile sections under it.
 * It used to carry three different section treatments for three peers: an 18px `CardTitle` in a
 * card, a bare 18px `h2` outside one, and a 16px `CardTitle` in a card. `SectionHeader` is the rung
 * between `PageHeader` and `CardTitle` and renders a real `h2`, which also puts these sections in
 * the document outline — as `CardTitle` divs they were invisible to heading navigation, so a screen
 * reader user jumped from the page title straight past the checklist.
 */
function OnboardingQuickStart({ isSysop }: { isSysop: boolean }) {
	return (
		<section className="space-y-3">
			<SectionHeader title="Quick Start" />
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<QuickStartCard
					description="Invite team members and assign roles."
					icon={Users}
					link="/settings/users"
					title="Manage Users"
				/>
				{isSysop && (
					<QuickStartCard
						description="Configure security and authentication settings."
						icon={Shield}
						link="/settings/authentication"
						title="Security Settings"
					/>
				)}
				<QuickStartCard
					description="View the main application dashboard."
					icon={LayoutDashboard}
					link="/dashboard"
					title="View Dashboard"
				/>
			</div>
		</section>
	);
}

export { OnboardingQuickStart };
