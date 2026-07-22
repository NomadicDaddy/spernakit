import type { BugReportKind } from 'spernakit-shared';

/**
 * Captures browser and environment metadata for bug reports.
 */
function captureBugMetadata(): Record<string, unknown> {
	const metadata: Record<string, unknown> = {
		cookieEnabled: navigator.cookieEnabled,
		language: navigator.language,
		onLine: navigator.onLine,
		pathname: window.location.pathname,
		screenResolution: `${window.screen.width}x${window.screen.height}`,
		timestamp: new Date().toISOString(),
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		url: window.location.href,
		userAgent: navigator.userAgent,
		viewportSize: `${window.innerWidth}x${window.innerHeight}`,
	};

	// Capture localStorage keys (not values, for privacy)
	try {
		metadata.localStorageKeys = Object.keys(localStorage);
	} catch {
		metadata.localStorageKeys = 'inaccessible';
	}

	// Capture theme preference
	const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
	metadata.theme = theme;

	return metadata;
}

interface BugReport {
	description: string;
	email?: string;
	kind: BugReportKind;
	metadata: Record<string, unknown>;
}

export { captureBugMetadata };
export type { BugReport, BugReportKind };
