import { PanelLeft, PanelTop } from 'lucide-react';

import { OptionCard } from '@/components/shared/OptionCard';
import { OptionCardGroup } from '@/components/shared/OptionCardGroup';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const layoutOptions: {
	description: string;
	icon: React.ReactNode;
	label: string;
	value: 'sidebar' | 'topbar';
}[] = [
	{
		description: 'Navigation down the left edge.',
		icon: <PanelLeft aria-hidden="true" className="size-5" />,
		label: 'Sidebar',
		value: 'sidebar',
	},
	{
		description: 'Navigation across the top.',
		icon: <PanelTop aria-hidden="true" className="size-5" />,
		label: 'Top Bar',
		value: 'topbar',
	},
];

interface LayoutDefaultsSectionProps {
	defaultLayoutMode: 'sidebar' | 'topbar';
	onDefaultLayoutChange: (mode: 'sidebar' | 'topbar') => void;
	pending: boolean;
}

function LayoutDefaultsSection({
	defaultLayoutMode,
	onDefaultLayoutChange,
	pending,
}: LayoutDefaultsSectionProps) {
	return (
		<Card>
			<CardHeader>
				{/* A real `h2`: the surface exposed exactly one heading — `h1 Settings` — so there
				    was nothing to jump between its two sections. */}
				<CardTitle>Default Layout</CardTitle>
				<CardDescription>
					Default layout for new users. Users can override in their preferences.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{/*
				 * Same option idiom as /profile/preferences — this sets the default for the very
				 * control the user meets there, so the two must not look like different kinds of
				 * choice.
				 */}
				<OptionCardGroup className="grid gap-3 sm:grid-cols-2" label="Default layout">
					{layoutOptions.map((option) => (
						<OptionCard
							description={option.description}
							disabled={pending}
							icon={option.icon}
							key={option.value}
							label={option.label}
							onSelect={() => {
								if (option.value === defaultLayoutMode) return;
								onDefaultLayoutChange(option.value);
							}}
							selected={defaultLayoutMode === option.value}
						/>
					))}
				</OptionCardGroup>
			</CardContent>
		</Card>
	);
}

export { LayoutDefaultsSection };
