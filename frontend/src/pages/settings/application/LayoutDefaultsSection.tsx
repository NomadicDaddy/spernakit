import { PanelLeft, PanelTop } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const layoutOptions: { icon: React.ReactNode; label: string; value: 'sidebar' | 'topbar' }[] = [
	{
		icon: <PanelLeft aria-hidden="true" className="size-5" />,
		label: 'Sidebar',
		value: 'sidebar',
	},
	{ icon: <PanelTop aria-hidden="true" className="size-5" />, label: 'Top Bar', value: 'topbar' },
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
				<CardTitle>Default Layout</CardTitle>
				<CardDescription>
					Default layout for new users. Users can override in their preferences.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex gap-3">
					{layoutOptions.map((option) => (
						<Button
							className={cn(
								'flex items-center gap-2',
								defaultLayoutMode === option.value &&
									'ring-primary ring-2 ring-offset-2'
							)}
							disabled={pending}
							key={option.value}
							onClick={() => {
								if (option.value === defaultLayoutMode) return;
								onDefaultLayoutChange(option.value);
							}}
							variant={defaultLayoutMode === option.value ? 'default' : 'outline'}>
							{option.icon}
							{option.label}
						</Button>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export { LayoutDefaultsSection };
