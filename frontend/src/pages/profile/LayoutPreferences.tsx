import { Maximize2, Minimize2, PanelLeft, PanelTop } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

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

const navOptions: { icon: React.ReactNode; label: string; value: 'sidebar' | 'topbar' }[] = [
	{
		icon: <PanelLeft aria-hidden="true" className="size-5" />,
		label: 'Sidebar',
		value: 'sidebar',
	},
	{ icon: <PanelTop aria-hidden="true" className="size-5" />, label: 'Top Bar', value: 'topbar' },
];

const widthOptions: {
	icon: React.ReactNode;
	label: string;
	value: 'centered' | 'full-width';
}[] = [
	{
		icon: <Minimize2 aria-hidden="true" className="size-5" />,
		label: 'Centered',
		value: 'centered',
	},
	{
		icon: <Maximize2 aria-hidden="true" className="size-5" />,
		label: 'Full Width',
		value: 'full-width',
	},
];

function LayoutPreferences({ handlers, settings }: LayoutPreferencesProps) {
	const { containerWidth, disabled, layoutMode, sidebarCollapsed } = settings;
	const { onContainerWidthChange, onLayoutModeChange, onSidebarCollapsedChange } = handlers;
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Navigation</CardTitle>
					<CardDescription>Choose your preferred navigation style</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex gap-3">
						{navOptions.map((option) => (
							<Button
								className={cn(
									'flex items-center gap-2',
									layoutMode === option.value &&
										'ring-primary ring-2 ring-offset-2'
								)}
								key={option.value}
								onClick={() => onLayoutModeChange(option.value)}
								variant={layoutMode === option.value ? 'default' : 'outline'}>
								{option.icon}
								{option.label}
							</Button>
						))}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Container Width</CardTitle>
					<CardDescription>Choose how wide page content should be</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex gap-3">
						{widthOptions.map((option) => (
							<Button
								className={cn(
									'flex items-center gap-2',
									containerWidth === option.value &&
										'ring-primary ring-2 ring-offset-2'
								)}
								key={option.value}
								onClick={() => onContainerWidthChange(option.value)}
								variant={containerWidth === option.value ? 'default' : 'outline'}>
								{option.icon}
								{option.label}
							</Button>
						))}
					</div>
				</CardContent>
			</Card>

			{layoutMode === 'sidebar' && (
				<Card>
					<CardHeader>
						<CardTitle>Sidebar</CardTitle>
						<CardDescription>Configure sidebar behavior</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center justify-between">
							<Label htmlFor="sidebar-collapsed">Collapsed by default</Label>
							<Switch
								checked={sidebarCollapsed}
								disabled={disabled}
								id="sidebar-collapsed"
								onCheckedChange={(checked) => onSidebarCollapsedChange(checked)}
							/>
						</div>
					</CardContent>
				</Card>
			)}
		</>
	);
}

export { LayoutPreferences };
