import { useQuery } from '@tanstack/react-query';

import { getUserUiSettings } from '@/api/userSettings';
import { useAuthStore } from '@/stores/authStore';

interface Formatters {
	formatCurrency: (amount: number) => string;
	formatDate: (ts: string) => string;
	formatDateTime: (ts: string) => string;
	formatTime: (ts: string) => string;
	formatTimestamp: (ts: string) => string;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function getRelativeFormatter(locale: string): Intl.RelativeTimeFormat {
	let fmt = relativeFormatters.get(locale);
	if (!fmt) {
		fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
		relativeFormatters.set(locale, fmt);
	}
	return fmt;
}

function getCurrencyFormatter(locale: string): Intl.NumberFormat {
	let fmt = currencyFormatters.get(locale);
	if (!fmt) {
		fmt = new Intl.NumberFormat(locale, { currency: 'USD', style: 'currency' });
		currencyFormatters.set(locale, fmt);
	}
	return fmt;
}

function getDateFormatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `${locale}|${opts.timeZone ?? ''}`;
	let fmt = dateFormatters.get(key);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat(locale, opts);
		dateFormatters.set(key, fmt);
	}
	return fmt;
}

function getTimeFormatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `${locale}|${opts.hour12}|${opts.second ?? ''}|${opts.timeZone ?? ''}`;
	let fmt = timeFormatters.get(key);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat(locale, opts);
		timeFormatters.set(key, fmt);
	}
	return fmt;
}

/**
 * Resolve the locale for Intl formatters.
 *
 * Priority: stored language preference → browser language → 'en-US' fallback.
 */
function resolveLocale(language?: string): string {
	if (language && language !== 'system') {
		return language;
	}
	if (typeof navigator !== 'undefined') {
		return navigator.languages?.[0] ?? navigator.language ?? 'en-US';
	}
	return 'en-US';
}

/** Map user timeFormat preference to Intl options. */
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

/**
 * Hook that returns date/time formatting functions bound to the
 * current user's display preferences (language, timezone, timeFormat).
 *
 * Language controls locale for all Intl formatters. Falls back to browser
 * defaults while settings are loading.
 *
 * The query is gated on `isAuthenticated` — the same gate its sibling `useSyncUiSettings`
 * uses. Ungated, this hook fires an authenticated-only request from every surface that
 * formats a date, including the anonymous shared-dashboard route, where the resulting 401
 * reaches the global session-expiry handler and evicts the visitor to /login.
 */
function useFormatters(): Formatters {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const { data } = useQuery({
		enabled: isAuthenticated,
		queryFn: getUserUiSettings,
		queryKey: ['user-ui-settings'],
		throwOnError: false,
	});

	const settings = data?.data;

	const timezone = settings?.timezone || undefined;
	const timeFormat = settings?.timeFormat || 'HH:mm';

	// Language controls locale for all Intl formatters (date, time, relative time, currency).
	// Falls back to browser language when no preference is stored.
	const locale = resolveLocale(settings?.language);
	const dateOpts: Intl.DateTimeFormatOptions = {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		...(timezone ? { timeZone: timezone } : {}),
	};
	const timeOpts = timeOptionsFor(timeFormat, timezone);

	const dateFmt = getDateFormatter(locale, dateOpts);
	const timeFmt = getTimeFormatter(locale, timeOpts);

	function formatDate(ts: string): string {
		return dateFmt.format(new Date(ts));
	}

	function formatTime(ts: string): string {
		return timeFmt.format(new Date(ts));
	}

	function formatTimestamp(ts: string): string {
		const date = new Date(ts);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		/*
		 * Split the sign off the magnitude before bucketing. `diffMs` runs negative for an instant
		 * that has not happened yet, and the buckets below are written as ascending thresholds, so
		 * a future date used to floor to a negative `diffMins`, satisfy the `< 1` branch, and
		 * render `relFmt.format(0, 'second')` — the share dialog read "This link stops working on
		 * now" for an expiry a month out. Formatting the magnitude and handing the direction to
		 * `Intl.RelativeTimeFormat` gives "in 3 days" the same way it gives "3 days ago", and keeps
		 * the seven-day fallthrough to an absolute date in both directions.
		 */
		const direction = diffMs < 0 ? 1 : -1;
		const absMs = Math.abs(diffMs);
		const diffMins = Math.floor(absMs / 60_000);
		const diffHours = Math.floor(absMs / 3_600_000);
		const diffDays = Math.floor(absMs / 86_400_000);

		const relFmt = getRelativeFormatter(locale);
		if (diffMins < 1) return relFmt.format(0, 'second');
		if (diffMins < 60) return relFmt.format(direction * diffMins, 'minute');
		if (diffHours < 24) return relFmt.format(direction * diffHours, 'hour');
		if (diffDays < 7) return relFmt.format(direction * diffDays, 'day');
		/*
		 * The fallback keeps the time. Every branch above this one is precise to the minute or the
		 * hour, and then at exactly seven days — the point where relative phrasing stops being
		 * useful and the reader starts wanting the actual instant — the helper dropped time of day
		 * entirely. On the audit log that made two records from the same morning indistinguishable.
		 */
		return formatDateTime(ts);
	}

	function formatDateTime(ts: string): string {
		return `${formatDate(ts)} ${formatTime(ts)}`;
	}

	function formatCurrency(amount: number): string {
		return getCurrencyFormatter(locale).format(amount);
	}

	return { formatCurrency, formatDate, formatDateTime, formatTime, formatTimestamp };
}

export { useFormatters };
export type { Formatters };
