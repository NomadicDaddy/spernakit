/**
 * Type definitions for spernakit-browser daemon and CLI.
 */

// ---------------------------------------------------------------------------
// Snapshot / Ref types
// ---------------------------------------------------------------------------

/** A single interactive element discovered during a snapshot. */
export interface RefEntry {
	/** Whether the element is checked (checkboxes, switches) */
	checked?: boolean;
	/** Whether the element is disabled */
	disabled?: boolean;
	/** Accessible name (aria-label, label text, placeholder, textContent, etc.) */
	name: string;

	/** Semantic role (link, button, textbox, checkbox, switch, combobox, tab, etc.) */
	role: string;
	/** CSS selector for re-locating the element in the DOM */
	selector: string;
	/** Current value (input value, select display text) */
	value?: string;
}

/** Result of a snapshot command. */
export interface SnapshotResult {
	/** Ordered list of interactive element refs (index = ref number - 1) */
	refs: RefEntry[];
	/** The formatted text tree shown to the AI agent */
	text: string;
	/** Current page title */
	title: string;

	/** Current page URL */
	url: string;
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export interface ConsoleEntry {
	level: 'error' | 'info' | 'warning';
	text: string;
	timestamp: string;
	url: string;
}

export interface NetworkErrorEntry {
	status: number | string;
	statusText: string;
	timestamp: string;
	url: string;
}

export interface SessionState {
	/** Buffered console errors and warnings */
	consoleEntries: ConsoleEntry[];
	/** Current page URL */
	currentUrl: string;
	/** Buffered network errors */
	networkErrors: NetworkErrorEntry[];
	/** Current ref map from last snapshot */
	refs: RefEntry[];
	/** Session name */
	sessionName: string;
	/** Current viewport dimensions */
	viewport: { height: number; width: number };
}

// ---------------------------------------------------------------------------
// IPC protocol (JSON-over-TCP with content-length framing)
// ---------------------------------------------------------------------------

/** Command sent from CLI client to daemon. */
export interface IpcRequest {
	args: string[];
	command: string;
	session: string;
}

/** Response sent from daemon to CLI client. */
export interface IpcResponse {
	/** Error message if not ok */
	error?: string;
	/** Whether the command succeeded */
	ok: boolean;
	/** Output text to display to the AI agent */
	output?: string;
}

// ---------------------------------------------------------------------------
// Daemon state
// ---------------------------------------------------------------------------

export interface DaemonInfo {
	pid: number;
	port: number;
	startedAt: string;
}

// ---------------------------------------------------------------------------
// Browser launch config (from crawltest patterns)
// ---------------------------------------------------------------------------

export const BROWSER_LAUNCH_ARGS = [
	'--no-sandbox',
	'--disable-setuid-sandbox',
	'--disable-dev-shm-usage',
] as const;

export const DEFAULT_VIEWPORT = { height: 1080, width: 1920 };
export const PROTOCOL_TIMEOUT = 120_000;
export const DAEMON_PORT = 19_222;
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const SCREENSHOT_TIMEOUT_MS = 15_000;

/**
 * Warning patterns from third-party libraries and browser internals that are
 * not actionable by app code. Matched against console message text.
 * (Imported from crawltest-types.ts pattern)
 */
export const IGNORED_WARNING_PATTERNS: RegExp[] = [
	/installHook\.js/i,
	/Download the React DevTools/i,
	/React does not recognize the .* prop/i,
	/Cannot update a component .* while rendering a different component/i,
	/findDOMNode is deprecated/i,
	/componentWillMount has been renamed/i,
	/componentWillReceiveProps has been renamed/i,
	/componentWillUpdate has been renamed/i,
	/Each child in a list should have a unique "key" prop/i,
	/browser\.runtime\.connect/i,
	/Extension context invalidated/i,
	/chrome-extension:\/\//i,
	/moz-extension:\/\//i,
	/WebSocket is closed before the connection is established/i,
];
