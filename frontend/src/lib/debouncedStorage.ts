/**
 * Debounced Storage for Zustand Persist
 *
 * ## Design Rationale
 *
 * Zustand's persist middleware writes the entire store state to localStorage/sessionStorage on
 * every state change. When multiple stores update in rapid succession (e.g., auth + theme + layout
 * on initial page load), or when a single store receives frequent updates (e.g., sidebar toggle
 * during drag), synchronous writes block the main thread and cause visible jank.
 *
 * This module wraps the Storage API with a debounce layer: writes are held in a pending map and
 * flushed after a configurable period of inactivity (default 300ms). This batches rapid state
 * changes into a single storage write, reducing main-thread blocking.
 *
 * ## Trade-offs
 *
 * - **Delayed persistence:** State is not written to storage immediately. If the browser crashes
 *   hard (power loss, OS kill) within the debounce window, the last ~300ms of state changes are
 *   lost. This is acceptable for preferences (theme, sidebar state, layout mode) but would NOT be
 *   appropriate for critical data.
 * - **Read-through consistency:** `getItem` checks the pending-write map first, so reads always
 *   return the latest value even before the debounce fires — no stale reads.
 *
 * ## Data-loss prevention
 *
 * To mitigate the crash-window risk, this module registers `beforeunload` and `pagehide` listeners
 * that synchronously flush ALL pending writes when the user navigates away or the page is hidden.
 * The `pagehide` event fires reliably in headless browsers, mobile Safari, and bfcache scenarios
 * where `beforeunload` may not.
 */
import type { PersistStorage, StorageValue } from 'zustand/middleware';

/** Default debounce delay in milliseconds for storage writes */
const DEFAULT_DEBOUNCE_MS = 300;

/** Module-level collection of flush callbacks registered across all instances */
const registeredFlushCallbacks: (() => void)[] = [];
let unloadListenerRegistered = false;

type BrowserStorageKind = 'localStorage' | 'sessionStorage';
const fallbackStorages: Record<BrowserStorageKind, Storage> = {
	localStorage: createMemoryStorage(),
	sessionStorage: createMemoryStorage(),
};

function createMemoryStorage(): Storage {
	const values = new Map<string, string>();

	return {
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => Array.from(values.keys())[index] ?? null,
		get length() {
			return values.size;
		},
		removeItem: (key) => {
			values.delete(key);
		},
		setItem: (key, value) => {
			values.set(key, value);
		},
	};
}

function safeStorageProvider(kind: BrowserStorageKind): Storage {
	if (typeof window === 'undefined') {
		return fallbackStorages[kind];
	}

	try {
		return window[kind];
	} catch {
		return fallbackStorages[kind];
	}
}

/**
 * Flush all registered debounced storage instances.
 * Called from both beforeunload and pagehide to maximize reliability.
 */
function flushAll(): void {
	for (const flush of registeredFlushCallbacks) {
		flush();
	}
}

/**
 * Register a flush callback for page unload events. Uses a single listener for all instances
 * to prevent listener accumulation. Listens on both beforeunload and pagehide — the latter
 * fires more reliably in headless browsers, mobile, and bfcache scenarios.
 */
function registerFlushCallback(flushInstance: () => void): void {
	registeredFlushCallbacks.push(flushInstance);

	if (!unloadListenerRegistered && typeof window !== 'undefined') {
		window.addEventListener('beforeunload', flushAll);
		window.addEventListener('pagehide', flushAll);
		unloadListenerRegistered = true;
	}
}

interface DebouncedStorageState {
	pendingWrites: Map<string, string>;
	storageApi: Storage;
	timeouts: Map<string, ReturnType<typeof setTimeout>>;
}

function flushKey(state: DebouncedStorageState, name: string): void {
	const value = state.pendingWrites.get(name);
	if (value !== undefined) {
		try {
			state.storageApi.setItem(name, value);
		} catch {
			// Quota exceeded or storage unavailable (private browsing)
		}
		state.pendingWrites.delete(name);
	}
	const timeout = state.timeouts.get(name);
	if (timeout) {
		clearTimeout(timeout);
		state.timeouts.delete(name);
	}
}

function debouncedGetItem<T>(state: DebouncedStorageState, name: string): null | StorageValue<T> {
	const pendingValue = state.pendingWrites.get(name);
	if (pendingValue !== undefined) {
		try {
			return JSON.parse(pendingValue) as StorageValue<T>;
		} catch {
			return null;
		}
	}

	let value: null | string;
	try {
		value = state.storageApi.getItem(name);
	} catch {
		return null;
	}
	if (value === null) return null;
	try {
		return JSON.parse(value) as StorageValue<T>;
	} catch {
		return null;
	}
}

function debouncedRemoveItem(state: DebouncedStorageState, name: string): void {
	state.pendingWrites.delete(name);
	const timeout = state.timeouts.get(name);
	if (timeout) {
		clearTimeout(timeout);
		state.timeouts.delete(name);
	}
	try {
		state.storageApi.removeItem(name);
	} catch {
		// Storage unavailable
	}
}

function debouncedSetItem<T>(
	state: DebouncedStorageState,
	name: string,
	value: StorageValue<T>,
	debounceMs: number
): void {
	const serialized = JSON.stringify(value);
	state.pendingWrites.set(name, serialized);

	const existingTimeout = state.timeouts.get(name);
	if (existingTimeout) {
		clearTimeout(existingTimeout);
	}

	const timeout = setTimeout(() => {
		flushKey(state, name);
	}, debounceMs);
	state.timeouts.set(name, timeout);
}

/**
 * Creates a debounced storage wrapper for Zustand persist middleware.
 * Writes are batched and only flushed after the specified delay of inactivity,
 * reducing main thread blocking from frequent localStorage/sessionStorage writes.
 *
 * @param storageApi - The underlying storage (localStorage or sessionStorage)
 * @param debounceMs - Delay in milliseconds before flushing writes (default: 300)
 * @returns PersistStorage-compatible storage object
 */
function createDebouncedStorage<T>(
	storageApi: Storage,
	debounceMs: number = DEFAULT_DEBOUNCE_MS
): PersistStorage<T> {
	const state: DebouncedStorageState = {
		pendingWrites: new Map(),
		storageApi,
		timeouts: new Map(),
	};

	registerFlushCallback(() => {
		for (const name of state.pendingWrites.keys()) {
			flushKey(state, name);
		}
	});

	return {
		getItem: (name) => debouncedGetItem<T>(state, name),
		removeItem: (name) => debouncedRemoveItem(state, name),
		setItem: (name, value) => debouncedSetItem(state, name, value, debounceMs),
	};
}

/** Debounced localStorage for Zustand persist */
const debouncedLocalStorage = <T>(): PersistStorage<T> =>
	createDebouncedStorage<T>(safeStorageProvider('localStorage'));

/** Debounced sessionStorage for Zustand persist */
const debouncedSessionStorage = <T>(): PersistStorage<T> =>
	createDebouncedStorage<T>(safeStorageProvider('sessionStorage'));

export { debouncedLocalStorage, debouncedSessionStorage };
