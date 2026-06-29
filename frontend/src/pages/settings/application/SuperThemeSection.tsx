import { Monitor, Terminal } from 'lucide-react';

import type { SuperTheme } from '@/lib/superThemes';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SUPER_THEMES } from '@/lib/superThemes';
import { cn } from '@/lib/utils';

const superThemeIcons: Record<SuperTheme, React.ReactNode> = {
	bbs: <Monitor className="size-5 text-fuchsia-400" />,
	default: <Monitor className="text-primary size-5" />,
	terminal: <Terminal className="size-5 text-green-400" />,
};

interface SuperThemeSectionProps {
	onSuperThemeChange: (theme: SuperTheme) => void;
	pending: boolean;
	superTheme: SuperTheme;
}

function SuperThemeSection({ onSuperThemeChange, pending, superTheme }: SuperThemeSectionProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Super-Theme</CardTitle>
				<CardDescription>Application-wide UI paradigm. Affects all users.</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					{SUPER_THEMES.map((theme) => (
						<button
							className={cn(
								'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
								superTheme === theme.value
									? 'border-primary ring-primary ring-2 ring-offset-2'
									: 'border-border hover:border-primary/50'
							)}
							disabled={pending}
							key={theme.value}
							onClick={() => {
								if (theme.value === superTheme) return;
								onSuperThemeChange(theme.value);
							}}
							type="button">
							<div className="shrink-0">{superThemeIcons[theme.value]}</div>
							<div className="min-w-0">
								<div className="text-sm font-medium">{theme.label}</div>
								<div className="text-muted-foreground text-xs">
									{theme.description}
								</div>
							</div>
						</button>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export { SuperThemeSection };
