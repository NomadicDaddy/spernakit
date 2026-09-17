import type { LogFn, LoggerOptions } from 'pino';

const ASSIGNMENT =
	/((?:api[_-]?key|authorization|credential|encryption[_-]?key|password|private[_-]?key|secret|token)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,]+)/gi;
const BEARER = /(bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const REDACTED = '[REDACTED]';
const SENSITIVE_KEY =
	/(?:api[_-]?key|authorization|credential|encryption[_-]?key|password|private[_-]?key|secret|token)/i;
const SENSITIVE_PATHS = new Set(['database.url']);

const registeredSecrets = new Set<string>();
let sortedSecrets: readonly string[] = [];

interface SecretRegistrationOptions {
	/** Split-secrets files treat every string leaf as secret, regardless of its key name. */
	includeEveryString?: boolean;
}

function addVariants(value: string): void {
	if (value.length === 0) return;
	const variants = [value, JSON.stringify(value).slice(1, -1)];
	try {
		const encoded = encodeURIComponent(value);
		variants.push(
			encoded,
			encoded.replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase()),
		);
	} catch {
		// A lone UTF-16 surrogate cannot be URI-encoded; the raw and JSON forms still remain covered.
	}
	for (const variant of variants) {
		if (variant.length > 0) registeredSecrets.add(variant);
	}
}

function collectSecretValues(
	value: unknown,
	includeEveryString: boolean,
	path = '',
	seen = new WeakSet<object>(),
): void {
	if (typeof value === 'string') {
		if (includeEveryString) addVariants(value);
		return;
	}
	if (value === null || typeof value !== 'object') return;
	if (seen.has(value)) return;
	seen.add(value);

	if (Array.isArray(value)) {
		for (const child of value) collectSecretValues(child, includeEveryString, path, seen);
		return;
	}

	for (const [key, child] of Object.entries(value)) {
		const childPath = path ? `${path}.${key}` : key;
		if (typeof child === 'string') {
			if (includeEveryString || SENSITIVE_KEY.test(key) || SENSITIVE_PATHS.has(childPath)) {
				addVariants(child);
			}
			continue;
		}
		collectSecretValues(child, includeEveryString, childPath, seen);
	}
}

/**
 * Add configured values to the process-wide denylist without ever returning or logging them.
 * @param value
 * @param options
 */
function registerLogSecretValues(value: unknown, options: SecretRegistrationOptions = {}): void {
	collectSecretValues(value, options.includeEveryString ?? false);
	sortedSecrets = [...registeredSecrets].sort((left, right) => right.length - left.length);
}

function redactText(text: string): string {
	let redacted = text;
	for (const secret of sortedSecrets) redacted = redacted.split(secret).join(REDACTED);
	return redacted.replace(BEARER, `$1${REDACTED}`).replace(ASSIGNMENT, `$1${REDACTED}`);
}

function scrubError(error: Error, seen: WeakMap<object, unknown>): Error {
	const clone = Object.create(Object.getPrototypeOf(error)) as Error;
	seen.set(error, clone);
	for (const key of Object.getOwnPropertyNames(error)) {
		const descriptor = Object.getOwnPropertyDescriptor(error, key);
		if (!descriptor || !('value' in descriptor)) continue;
		Object.defineProperty(clone, key, {
			...descriptor,
			value: scrubLogValue(descriptor.value, seen),
		});
	}
	return clone;
}

function scrubLogValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
	if (typeof value === 'string') return redactText(value);
	if (value === null || typeof value !== 'object') return value;
	const existing = seen.get(value);
	if (existing !== undefined) return existing;
	if (value instanceof Error) return scrubError(value, seen);
	if (Array.isArray(value)) {
		const clone: unknown[] = [];
		seen.set(value, clone);
		for (const child of value) clone.push(scrubLogValue(child, seen));
		return clone;
	}

	const clone: Record<string, unknown> = {};
	seen.set(value, clone);
	for (const [key, child] of Object.entries(value)) clone[key] = scrubLogValue(child, seen);
	return clone;
}

function scrubLogArguments(args: Parameters<LogFn>): Parameters<LogFn> {
	const seen = new WeakMap<object, unknown>();
	return args.map((argument) => scrubLogValue(argument, seen)) as Parameters<LogFn>;
}

const LOG_SECRET_REDACTION_HOOKS: NonNullable<LoggerOptions['hooks']> = {
	logMethod(args, method) {
		method.apply(this, scrubLogArguments(args));
	},
};

export { LOG_SECRET_REDACTION_HOOKS, registerLogSecretValues };
