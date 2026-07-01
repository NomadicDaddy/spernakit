import type { AlertData } from './alertWebhook.ts';

function severityLabel(severity: AlertData['severity']): string {
	return severity === 'critical' ? 'CRITICAL' : 'WARNING';
}

export { severityLabel };
