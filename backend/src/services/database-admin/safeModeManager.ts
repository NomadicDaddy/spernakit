/**
 * In-memory safe mode state for database admin operations.
 * Safe mode is enabled by default on server start to prevent accidental mutations.
 */
let safeModeEnabled = true;

/**
 * Returns whether safe mode is currently enabled.
 * @returns True if safe mode is enabled.
 */
function getSafeMode(): boolean {
	return safeModeEnabled;
}

/**
 * Sets the safe mode state.
 * @param enabled
 */
function setSafeMode(enabled: boolean): void {
	safeModeEnabled = enabled;
}

export { getSafeMode, setSafeMode };
