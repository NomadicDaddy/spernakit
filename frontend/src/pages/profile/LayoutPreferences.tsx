import { Maximize2, Minimize2, PanelLeft, PanelTop } from 'lucide-react';

import { OptionCard } from '@/components/shared/OptionCard';
import { OptionCardGroup } from '@/components/shared/OptionCardGroup';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

import { PreferenceGroup } from './PreferenceGroup';

interface LayoutPreferencesSettings {
	containerWidth: 'centered' | 'full-width';
	disabled: boolean;
	layoutMode: 'sidebar' | 'topbar';
	sidebarCollapsed: boolean;
}

interface LayoutPreferencesHandlers {
	onContainerWidthChange: (width: 'centered' | 'full-width') => void;
	onLayoutModeChange: (mode: 'sidebar' | 'topbar') => void;
	onSidebarCollapsedChange: (collapsed: boolean) => void;
}

type LayoutPreferencesProps = {
	handlers: LayoutPreferencesHandlers;
	settings: LayoutPreferencesSettings;
};

const navOptions: {
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

const widthOptions: {
	description: string;
	icon: React.ReactNode;
	label: string;
	value: 'centered' | 'full-width';
}[] = [
	{
		description: 'Content sits in a fixed-width column.',
		icon: <Minimize2 aria-hidden="true" className="size-5" />,
		label: 'Centered',
		value: 'centered',
	},
	{
		description: 'Content fills the whole window.',
		icon: <Maximize2 aria-hidden="true" className="size-5" />,
		label: 'Full Width',
		value: 'full-width',
	},
];

/**
 * The Layout group: navigation style, container width and sidebar behaviour, previously three
 * separate full-width cards (the third of which appeared and disappeared as the first changed).
 */
function LayoutPreferences({ handlers, settings }: LayoutPreferencesProps) {
	const { containerWidth, disabled, layoutMode, sidebarCollapsed } = settings;
	const { onContainerWidthChange, onLayoutModeChange, onSidebarCollapsedChange } = handlers;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Layout</CardTitle>
				<CardDescription>Where navigation sits and how wide pages run</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<PreferenceGroup
					description="Choose your preferred navigation style."
					label="Navigation"
					labelId="pref-navigation">
					{/*
					 * Auto-fill for the same reason the Accent group below uses it: a fixed
					 * `sm:grid-cols-2` divides the card rather than sizing the tiles, so at 2560
					 * each of these two tiles ran 705px wide around 218px of content. 18rem is what
					 * the widest of these needs — "Content sits in a fixed-width column." at 173px,
					 * plus the icon, the gap and `p-3` either side. The `min(…,100%)` is not
					 * decoration: a bare `minmax(18rem,1fr)` track does not shrink below its floor,
					 * so on a 390px phone, where the card's content box is 277px, the tiles would
					 * push a horizontal scrollbar onto the page.
					 */}
					<OptionCardGroup
						className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-3"
						labelledBy="pref-navigation">
						{navOptions.map((option) => (
							<OptionCard
								description={option.description}
								disabled={disabled}
								icon={option.icon}
								key={option.value}
								label={option.label}
								onSelect={() => onLayoutModeChange(option.value)}
								selected={layoutMode === option.value}
							/>
						))}
					</OptionCardGroup>
				</PreferenceGroup>

				<PreferenceGroup
					description="Choose how wide page content should be."
					label="Container width"
					labelId="pref-container-width">
					<OptionCardGroup
						className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-3"
						labelledBy="pref-container-width">
						{widthOptions.map((option) => (
							<OptionCard
								description={option.description}
								disabled={disabled}
								icon={option.icon}
								key={option.value}
								label={option.label}
								onSelect={() => onContainerWidthChange(option.value)}
								selected={containerWidth === option.value}
							/>
						))}
					</OptionCardGroup>
				</PreferenceGroup>

				{layoutMode === 'sidebar' && (
					/*
					 * A boolean, so it stays a Switch row rather than becoming two tiles. The
					 * OptionCard idiom is for "pick one of N", not for on/off.
					 */
					<PreferenceGroup
						description="Start each session with the sidebar collapsed."
						label="Sidebar">
						{/* The whole row is the target, matching the Notifications card. */}
						<label
							className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3"
							htmlFor="sidebar-collapsed">
							<span className="text-sm font-medium">Collapsed by default</span>
							<Switch
								checked={sidebarCollapsed}
								disabled={disabled}
								id="sidebar-collapsed"
								onCheckedChange={(checked) => onSidebarCollapsedChange(checked)}
							/>
						</label>
					</PreferenceGroup>
				)}
			</CardContent>
		</Card>
	);
}

export { LayoutPreferences };
