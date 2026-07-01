/** Available super-theme UI paradigms. */
type SuperTheme = 'bbs' | 'default' | 'terminal';

interface SuperThemeApplicableSettings {
	appTheme: boolean;
	containerWidth: boolean;
	density: boolean;
	layoutMode: boolean;
	sidebarCollapsed: boolean;
}

interface SuperThemeDefinition {
	/** Which existing settings are relevant for this super-theme. */
	applicableSettings: SuperThemeApplicableSettings;
	description: string;
	label: string;
	value: SuperTheme;
}

const SUPER_THEMES: SuperThemeDefinition[] = [
	{
		applicableSettings: {
			appTheme: true,
			containerWidth: true,
			density: true,
			layoutMode: true,
			sidebarCollapsed: true,
		},
		description: 'Standard modern web interface',
		label: 'Default',
		value: 'default',
	},
	{
		applicableSettings: {
			appTheme: false,
			containerWidth: false,
			density: false,
			layoutMode: false,
			sidebarCollapsed: false,
		},
		description: 'CLI-in-browser, monospace, utilitarian',
		label: 'Terminal',
		value: 'terminal',
	},
	{
		applicableSettings: {
			appTheme: false,
			containerWidth: false,
			density: false,
			layoutMode: false,
			sidebarCollapsed: false,
		},
		description: 'Retro BBS aesthetic with ANSI flair',
		label: 'BBS',
		value: 'bbs',
	},
];

/** Default super-theme definition (standard web UI). */
const DEFAULT_SUPER_THEME = SUPER_THEMES[0] as SuperThemeDefinition;

/** Get the definition for a given super-theme. Falls back to default. */
function getSuperThemeDefinition(theme: SuperTheme): SuperThemeDefinition {
	return SUPER_THEMES.find((t) => t.value === theme) ?? DEFAULT_SUPER_THEME;
}

export { getSuperThemeDefinition, SUPER_THEMES };
export type { SuperTheme, SuperThemeApplicableSettings, SuperThemeDefinition };
