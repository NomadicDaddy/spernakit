/** Available application color themes. */
type AppTheme = 'default' | 'forest' | 'monochrome' | 'ocean' | 'rose' | 'sunset';

interface ThemeDefinition {
	/** CSS class to apply on <html> (empty string for default). */
	className: string;
	description: string;
	label: string;
	/** OKLCH color string for the preview swatch. */
	preview: string;
	value: AppTheme;
}

const APP_THEMES: ThemeDefinition[] = [
	{
		className: '',
		description: 'Teal-violet accent',
		label: 'Default',
		preview: 'oklch(0.52 0.19 250)',
		value: 'default',
	},
	{
		className: 'theme-ocean',
		description: 'Deep blue tones',
		label: 'Ocean',
		preview: 'oklch(0.546 0.245 262.881)',
		value: 'ocean',
	},
	{
		className: 'theme-forest',
		description: 'Natural green tones',
		label: 'Forest',
		preview: 'oklch(0.627 0.194 149.214)',
		value: 'forest',
	},
	{
		className: 'theme-sunset',
		description: 'Warm orange tones',
		label: 'Sunset',
		preview: 'oklch(0.646 0.222 41.116)',
		value: 'sunset',
	},
	{
		className: 'theme-rose',
		description: 'Soft pink tones',
		label: 'Rose',
		preview: 'oklch(0.586 0.253 17.585)',
		value: 'rose',
	},
	{
		className: 'theme-monochrome',
		description: 'Neutral grayscale',
		label: 'Monochrome',
		preview: 'oklch(0.35 0.01 260)',
		value: 'monochrome',
	},
];

export { APP_THEMES };
export type { AppTheme, ThemeDefinition };
