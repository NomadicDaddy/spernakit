/**
 * Format bytes as human-readable file size.
 */
const numFmt2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return numFmt2.format(bytes / Math.pow(k, i)) + ' ' + sizes[i];
}

/**
 * Format a timestamp string to a short time label (HH:mm).
 */
function formatTime(timestamp: string, locale?: string): string {
	return new Date(timestamp).toLocaleTimeString(locale, {
		hour: '2-digit',
		minute: '2-digit',
	});
}

/**
 * Display-only normalizer for scheduler interval expressions.
 *
 * Accepts strings matching `<digits>(ms|s|m|h|d)` and walks upward to the largest
 * sensible unit (ms -> s when divisible by 1000, s -> m by 60, m -> h by 60,
 * h -> d by 24). Inputs that don't match the pattern (empty string, cron
 * patterns like '*\/5 * * * *', unknown formats) are returned unchanged.
 *
 * Examples: '168h' -> '7d', '60000ms' -> '1m', '5000ms' -> '5s', '6h' -> '6h'.
 */
function formatScheduleExpression(value: string): string {
	const match = /^(\d+)(ms|[dhms])$/.exec(value);
	if (!match) return value;

	let amount = Number(match[1]);
	let unit: 'd' | 'h' | 'm' | 'ms' | 's' = match[2] as 'd' | 'h' | 'm' | 'ms' | 's';

	if (unit === 'ms' && amount % 1000 === 0) {
		amount = amount / 1000;
		unit = 's';
	}
	if (unit === 's' && amount % 60 === 0) {
		amount = amount / 60;
		unit = 'm';
	}
	if (unit === 'm' && amount % 60 === 0) {
		amount = amount / 60;
		unit = 'h';
	}
	if (unit === 'h' && amount % 24 === 0) {
		amount = amount / 24;
		unit = 'd';
	}

	return `${amount}${unit}`;
}

export { formatBytes, formatScheduleExpression, formatTime };
