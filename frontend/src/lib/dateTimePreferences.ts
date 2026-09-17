type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

function dateOptionsFor(timezone: string | undefined): Intl.DateTimeFormatOptions {
	return {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		...(timezone ? { timeZone: timezone } : {}),
	};
}

function timeOptionsFor(
	timeFormat: string,
	timezone: string | undefined,
): Intl.DateTimeFormatOptions {
	const hour12 = timeFormat.includes('AM/PM');
	const showSeconds = timeFormat.includes(':ss');
	return {
		hour: '2-digit',
		hour12,
		minute: '2-digit',
		...(showSeconds ? { second: '2-digit' } : {}),
		...(timezone ? { timeZone: timezone } : {}),
	};
}

function formatDateByPreference(
	formatter: Intl.DateTimeFormat,
	date: Date,
	dateFormat: string,
): string {
	const parts = new Map(
		formatter
			.formatToParts(date)
			.filter((part) => part.type !== 'literal')
			.map((part) => [part.type, part.value]),
	);
	const day = parts.get('day') ?? '';
	const month = parts.get('month') ?? '';
	const year = parts.get('year') ?? '';
	switch (dateFormat as DateFormat) {
		case 'DD/MM/YYYY':
			return `${day}/${month}/${year}`;
		case 'YYYY-MM-DD':
			return `${year}-${month}-${day}`;
		case 'MM/DD/YYYY':
		default:
			return `${month}/${day}/${year}`;
	}
}

export { dateOptionsFor, formatDateByPreference, timeOptionsFor };
