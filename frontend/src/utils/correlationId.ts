const SESSION_ID_KEY = `${__APP_SLUG__}-session-id`;

let sessionId: null | string = null;
let requestCounter = 0;

/**
 * Gets or creates a session correlation ID.
 *
 * The session ID persists across page navigations using sessionStorage,
 * allowing tracing of a user's session through multiple requests.
 */
export function getSessionId(): string {
	if (sessionId) {
		return sessionId;
	}

	try {
		const storedId = sessionStorage.getItem(SESSION_ID_KEY);

		if (storedId) {
			sessionId = storedId;
			return sessionId;
		}
	} catch {
		// sessionStorage unavailable (private browsing, quota exceeded)
	}

	// crypto.randomUUID() requires a secure context (HTTPS or localhost).
	// Fall back to crypto.getRandomValues() for plain HTTP on LAN IPs.
	const newId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : fallbackUUID();
	sessionId = newId;

	try {
		sessionStorage.setItem(SESSION_ID_KEY, newId);
	} catch {
		// sessionStorage unavailable — in-memory fallback still works
	}

	return newId;
}

/**
 * Generates a unique request ID for individual API calls.
 *
 * Combines the session ID with an incrementing counter to ensure
 * uniqueness across the session while maintaining session linkage.
 *
 * @returns A unique request ID in format "sessionId-counter"
 */
export function generateRequestId(): string {
	const sid = getSessionId();
	requestCounter++;
	return `${sid}-${requestCounter}`;
}

/**
 * Resets the session ID. Called on logout to clear session correlation.
 */
export function resetSessionId(): void {
	sessionId = null;
	try {
		sessionStorage.removeItem(SESSION_ID_KEY);
	} catch {
		// sessionStorage unavailable
	}
	requestCounter = 0;
}

/** Generate a v4 UUID using crypto.getRandomValues (works in all contexts). */
function fallbackUUID(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes.set([((bytes.at(6) ?? 0) & 0x0f) | 0x40], 6); // version 4
	bytes.set([((bytes.at(8) ?? 0) & 0x3f) | 0x80], 8); // variant 1
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
