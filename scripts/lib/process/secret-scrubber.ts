import fs from 'node:fs';
import path from 'node:path';

const SECRET_KEY =
	/(?:api[_-]?key|credential|encryption[_-]?key|password|private[_-]?key|secret|token)/i;
const ASSIGNMENT =
	/((?:api[_-]?key|authorization|credential|password|secret|token)\s*[:=]\s*["']?)([^\s,"']+)/gi;
const BEARER = /(bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const REDACTED = '[REDACTED]';

function collectObjectSecrets(value: unknown, includeEveryString = false): string[] {
	if (Array.isArray(value)) {
		return value.flatMap((item) => collectObjectSecrets(item, includeEveryString));
	}
	if (value === null || typeof value !== 'object') return [];

	return Object.entries(value).flatMap(([key, child]) => {
		if (typeof child === 'string') {
			return (includeEveryString || SECRET_KEY.test(key)) && child.length >= 4 ? [child] : [];
		}
		return collectObjectSecrets(child, includeEveryString);
	});
}

function escapedVariants(value: string): string[] {
	const json = JSON.stringify(value).slice(1, -1);
	const encoded = encodeURIComponent(value);
	return [...new Set([encoded, json, value])].filter((item) => item.length >= 4);
}

/** Collect exact configured secret values without returning their names or writing their values. */
function collectConfiguredSecrets(repoRoot: string, config: unknown): string[] {
	const values = collectObjectSecrets(config);
	const configDir = path.join(repoRoot, 'config');
	if (fs.existsSync(configDir)) {
		for (const filename of fs.readdirSync(configDir)) {
			if (!filename.endsWith('.secrets.json')) continue;
			try {
				const parsed = JSON.parse(
					fs.readFileSync(path.join(configDir, filename), 'utf8'),
				) as unknown;
				values.push(...collectObjectSecrets(parsed, true));
			} catch {
				// The application's config loader reports malformed secret files. Logging still starts with
				// the valid values already collected; this helper never prints secret-file contents.
			}
		}
	}
	for (const [key, value] of Object.entries(process.env)) {
		if (value && value.length >= 4 && SECRET_KEY.test(key)) values.push(value);
	}
	return [...new Set(values.flatMap(escapedVariants))].sort((a, b) => b.length - a.length);
}

function redactText(text: string, secrets: readonly string[]): string {
	let redacted = text;
	for (const secret of secrets) redacted = redacted.split(secret).join(REDACTED);
	return redacted.replace(BEARER, `$1${REDACTED}`).replace(ASSIGNMENT, (match, prefix, value) => {
		return /^\[redacted\]$/i.test(String(value)) ? match : `${String(prefix)}${REDACTED}`;
	});
}

/**
 * Stateful text scrubber. It retains complete lines and enough literal overlap that a secret split
 * across arbitrary child-process chunks cannot be written before the full match is visible.
 */
class SecretScrubber {
	private readonly decoder = new TextDecoder();
	private readonly overlap: number;
	private readonly secrets: readonly string[];
	private pending = '';

	constructor(secrets: readonly string[]) {
		this.secrets = secrets;
		this.overlap = Math.max(1, ...secrets.map((value) => value.length)) - 1;
	}

	push(chunk: Uint8Array): string {
		this.pending += this.decoder.decode(chunk, { stream: true });
		const safeBoundary = this.pending.length - this.overlap;
		if (safeBoundary <= 0) return '';
		const end = this.pending.lastIndexOf('\n', safeBoundary - 1) + 1;
		if (end <= 0) return '';
		const ready = this.pending.slice(0, end);
		this.pending = this.pending.slice(end);
		return redactText(ready, this.secrets);
	}

	finish(): string {
		this.pending += this.decoder.decode();
		const ready = redactText(this.pending, this.secrets);
		this.pending = '';
		return ready;
	}
}

export { collectConfiguredSecrets, redactText, SecretScrubber };
