interface TemplateVariables {
	appName: string;
	checkType: string;
	healthUrl: string;
	message: string;
	severityBgColor: string;
	severityColor: string;
	severityLabel: string;
	timestamp: string;
}

/** Keys whose values are trusted HTML-safe (e.g., hex colors, URLs built internally). */
const HTML_SAFE_KEYS = new Set(['healthUrl', 'severityBgColor', 'severityColor']);

/**
 * Encode HTML entities to prevent XSS in template output.
 *
 * @param str - Raw string to encode
 * @returns HTML-entity-encoded string
 */
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderTemplate(template: string, variables: TemplateVariables): string {
	let result = template;
	for (const [key, value] of Object.entries(variables)) {
		const placeholder = `{{${key}}}`;
		const safe = HTML_SAFE_KEYS.has(key) ? String(value) : escapeHtml(String(value));
		result = result.replaceAll(placeholder, safe);
	}
	return result;
}

async function loadEmailTemplate(templateName: string): Promise<string> {
	const path = new URL(`../../templates/email/${templateName}.html`, import.meta.url);
	const template = await Bun.file(path.href).text();
	return template;
}

function getSeverityColors(severity: 'critical' | 'warn'): { bgColor: string; color: string } {
	if (severity === 'critical') {
		return { bgColor: '#dc2626', color: '#ffffff' };
	}
	return { bgColor: '#f59e0b', color: '#ffffff' };
}

interface HealthCheckAlertInput {
	appName: string;
	checkType: string;
	createdAt: Date;
	frontendUrl: string;
	message: string;
	severity: 'critical' | 'warn';
}

function buildHealthCheckAlertVariables(input: HealthCheckAlertInput): TemplateVariables {
	const severityColors = getSeverityColors(input.severity);
	const severityLabel = input.severity === 'critical' ? 'CRITICAL' : 'WARNING';
	const timestamp = input.createdAt.toISOString();
	const healthUrl = `${input.frontendUrl}/settings#system-health`;

	return {
		appName: input.appName,
		checkType: input.checkType,
		healthUrl,
		message: input.message,
		severityBgColor: severityColors.bgColor,
		severityColor: severityColors.color,
		severityLabel,
		timestamp,
	};
}

export { buildHealthCheckAlertVariables, loadEmailTemplate, renderTemplate };
