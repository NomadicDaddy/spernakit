import { Monitor, Moon, Sun } from 'lucide-react';

import type { AppTheme } from '@/lib/themes';
import type { ThemeMode } from '@/stores/themeStore';

import { OptionCard } from '@/components/shared/OptionCard';
import { OptionCardGroup } from '@/components/shared/OptionCardGroup';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_THEMES } from '@/lib/themes';

import { PreferenceGroup } from './PreferenceGroup';

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

/**
 * The Appearance group: colour scheme and accent, previously two separate full-width cards.
 */
function ThemePreferences({
	appTheme,
	disabled,
	onAppThemeChange,
	onThemeModeChange,
	themeMode,
}: ThemePreferencesProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Appearance</CardTitle>
				<CardDescription>How the app looks to you on this account</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<PreferenceGroup
					description="Follow your system setting, or pick one."
					label="Color scheme"
					labelId="pref-color-scheme">
					<OptionCardGroup
						className="grid gap-3 sm:grid-cols-3"
						labelledBy="pref-color-scheme">
						{themeOptions.map((option) => (
							<OptionCard
								disabled={disabled}
								icon={option.icon}
								key={option.value}
								label={option.label}
								onSelect={() => onThemeModeChange(option.value)}
								selected={themeMode === option.value}
							/>
						))}
					</OptionCardGroup>
				</PreferenceGroup>

				<PreferenceGroup
					description="The accent colour used for primary actions and highlights."
					label="Accent"
					labelId="pref-accent">
					{/*
					 * Auto-fill, not fixed column counts. `xl:grid-cols-6` made the layout worse
					 * as the window grew: at 1280 it forced six columns of ~200px and the
					 * "Monochrome" label overflowed its tile by 13px, so 1280 looked worse than
					 * 1024. 14rem is the width the longest label plus its swatch needs.
					 */}
					<OptionCardGroup
						className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3"
						labelledBy="pref-accent">
						{APP_THEMES.map((theme) => (
							<OptionCard
								description={theme.description}
								disabled={disabled}
								key={theme.value}
								label={theme.label}
								onSelect={() => onAppThemeChange(theme.value)}
								selected={appTheme === theme.value}
								swatch={theme.preview}
							/>
						))}
					</OptionCardGroup>
				</PreferenceGroup>
			</CardContent>
		</Card>
	);
}

export { ThemePreferences };
