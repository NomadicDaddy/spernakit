import { Monitor, Moon, Sun } from 'lucide-react';

import type { AppTheme } from '@/lib/themes';
import type { ThemeMode } from '@/stores/themeStore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_THEMES } from '@/lib/themes';
import { cn } from '@/lib/utils';

type ThemePreferencesProps = {
	appTheme: AppTheme;
	disabled: boolean;
	onAppThemeChange: (theme: AppTheme) => void;
	onThemeModeChange: (mode: ThemeMode) => void;
	themeMode: ThemeMode;
};

const themeOptions: { icon: React.ReactNode; label: string; value: ThemeMode }[] = [
	{ icon: <Sun aria-hidden="true" className="size-5" />, label: 'Light', value: 'light' },
	{ icon: <Moon aria-hidden="true" className="size-5" />, label: 'Dark', value: 'dark' },
	{ icon: <Monitor aria-hidden="true" className="size-5" />, label: 'System', value: 'system' },
];

function ThemePreferences({
	appTheme,
	disabled,
	onAppThemeChange,
	onThemeModeChange,
	themeMode,
}: ThemePreferencesProps) {
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Theme</CardTitle>
					<CardDescription>Choose your preferred color scheme</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex gap-3">
						{themeOptions.map((option) => (
							<Button
								className={cn(
									'flex items-center gap-2',
									themeMode === option.value &&
										'ring-primary ring-2 ring-offset-2'
								)}
								key={option.value}
								onClick={() => onThemeModeChange(option.value)}
								variant={themeMode === option.value ? 'default' : 'outline'}>
								{option.icon}
								{option.label}
							</Button>
						))}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>App Theme</CardTitle>
					<CardDescription>Choose your preferred color accent</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
						{APP_THEMES.map((theme) => (
							<button
								className={cn(
									'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
									appTheme === theme.value
										? 'border-primary ring-primary ring-2 ring-offset-2'
										: 'border-border hover:border-primary/50'
								)}
								disabled={disabled}
								key={theme.value}
								onClick={() => onAppThemeChange(theme.value)}
								type="button">
								<div
									className="size-8 shrink-0 rounded-full"
									style={{ backgroundColor: theme.preview }}
								/>
								<div className="min-w-0">
									<div className="text-sm font-medium">{theme.label}</div>
									<div className="text-muted-foreground truncate text-xs">
										{theme.description}
									</div>
								</div>
							</button>
						))}
					</div>
				</CardContent>
			</Card>
		</>
	);
}

export { ThemePreferences };
