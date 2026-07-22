import type React from 'react';

import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcut configuration.
 */
interface Shortcut {
	/** Human-readable description shown in shortcuts help dialog */
	description: string;
	/** Callback invoked when shortcut is triggered */
	handler: () => void;
	/**
	 * Key or key sequence to trigger the shortcut.
	 * - Single key: 'k', '?', 'Escape'
	 * - Two-key sequence: 'g d' (press g, then d within 800ms)
	 */
	key: string;
	/** Display label for the shortcut (e.g., 'Ctrl+K', 'g d') */
	label: string;
}

/**
 * Single-key shortcuts (e.g., 'k', '?').
 * These trigger immediately on keydown.
 */
const shortcuts = new Map<string, Shortcut>();

/**
 * Two-key sequence shortcuts (e.g., 'g d', 'g s', 'g n').
 * These require pressing the first key, then the second key within 800ms.
 * Used for vim-style navigation shortcuts without requiring modifier keys.
 */
const sequenceShortcuts = new Map<string, Shortcut>();

/**
 * Modifier+key combo shortcuts (e.g., 'mod+k' for Ctrl+K/Cmd+K).
 * Use 'mod+' prefix for platform-agnostic Ctrl/Cmd combos.
 * Use 'ctrl+' for explicit Ctrl-only combos.
 */
const modifierShortcuts = new Map<string, Shortcut>();

/** Set of first-key prefixes for O(1) lookup on every keydown instead of array spread + .some() */
const sequencePrefixKeys = new Set<string>();

/** Timeout in milliseconds for sequence shortcuts (e.g., user must press 'g' then 'd' within this window) */
const SEQUENCE_TIMEOUT_MS = 800;

/** Rebuild the prefix key set from all registered sequence shortcuts */
function rebuildPrefixKeys(): void {
	sequencePrefixKeys.clear();
	for (const key of sequenceShortcuts.keys()) {
		const spaceIdx = key.indexOf(' ');
		if (spaceIdx !== -1) {
			sequencePrefixKeys.add(key.substring(0, spaceIdx));
		}
	}
}

/**
 * Check if the currently focused element is an input that should capture keyboard events.
 * Shortcuts are disabled when user is typing in input fields.
 */
function isInputFocused(): boolean {
	const active = document.activeElement;
	if (!active) return false;
	const tag = active.tagName.toLowerCase();
	return (
		tag === 'input' ||
		tag === 'textarea' ||
		tag === 'select' ||
		(active as HTMLElement).isContentEditable
	);
}

/**
 * Register a keyboard shortcut.
 * Single keys are stored in `shortcuts`, sequences (containing space) in `sequenceShortcuts`.
 * @returns Cleanup function to unregister the shortcut
 */
function registerShortcut(shortcut: Shortcut): () => void {
	if (shortcut.key.startsWith('mod+') || shortcut.key.startsWith('ctrl+')) {
		modifierShortcuts.set(shortcut.key, shortcut);
	} else if (shortcut.key.includes(' ')) {
		sequenceShortcuts.set(shortcut.key, shortcut);
		rebuildPrefixKeys();
	} else {
		shortcuts.set(shortcut.key, shortcut);
	}

	return () => {
		if (shortcut.key.startsWith('mod+') || shortcut.key.startsWith('ctrl+')) {
			modifierShortcuts.delete(shortcut.key);
		} else if (shortcut.key.includes(' ')) {
			sequenceShortcuts.delete(shortcut.key);
			rebuildPrefixKeys();
		} else {
			shortcuts.delete(shortcut.key);
		}
	};
}

/**
 * Get all registered shortcuts for display in help dialog.
 */
function getShortcuts(): Shortcut[] {
	return [...shortcuts.values(), ...sequenceShortcuts.values(), ...modifierShortcuts.values()];
}

/**
 * Hook that enables keyboard shortcuts when active.
 * Must be called once in a component that is always mounted (e.g., AppShell).
 *
 * Supports two types of shortcuts:
 * 1. Single-key: Triggers immediately (e.g., '?' for help, 'k' for command palette)
 * 2. Sequence: Requires two keys in succession (e.g., 'g d' for dashboard)
 *
 * Sequences use vim-style navigation without modifier keys for ergonomic access.
 * The sequence timeout (800ms) balances responsiveness with user typing speed.
 */
/** Try matching a modifier+key combo (Ctrl/Cmd+key). Works even in input fields. */
function tryModifierShortcut(e: KeyboardEvent): boolean {
	if (!e.metaKey && !e.ctrlKey) return false;

	const modKey = `mod+${e.key.toLowerCase()}`;
	const ctrlKey = `ctrl+${e.key.toLowerCase()}`;
	const match = modifierShortcuts.get(modKey) ?? modifierShortcuts.get(ctrlKey);
	if (!match) return false;

	e.preventDefault();
	match.handler();
	return true;
}

/** Try completing a pending two-key sequence. Clears pending state regardless. */
function trySequenceShortcut(
	e: KeyboardEvent,
	pendingKey: React.RefObject<null | string>,
	pendingTimer: React.RefObject<null | ReturnType<typeof setTimeout>>
): boolean {
	if (!pendingKey.current) return false;

	const seq = `${pendingKey.current} ${e.key}`;
	const match = sequenceShortcuts.get(seq);
	pendingKey.current = null;
	if (pendingTimer.current) {
		clearTimeout(pendingTimer.current);
		pendingTimer.current = null;
	}
	if (!match) return false;

	e.preventDefault();
	match.handler();
	return true;
}

/** Try starting a new sequence or matching a single-key shortcut. */
function tryStartSequenceOrSingleKey(
	e: KeyboardEvent,
	pendingKey: React.RefObject<null | string>,
	pendingTimer: React.RefObject<null | ReturnType<typeof setTimeout>>
): void {
	const possiblePrefix = sequencePrefixKeys.has(e.key);
	if (possiblePrefix && !e.metaKey && !e.ctrlKey && !e.altKey) {
		pendingKey.current = e.key;
		pendingTimer.current = setTimeout(() => {
			pendingKey.current = null;
			pendingTimer.current = null;
		}, SEQUENCE_TIMEOUT_MS);
		return;
	}

	const shortcut = shortcuts.get(e.key);
	if (shortcut) {
		e.preventDefault();
		shortcut.handler();
	}
}

function useKeyboardShortcuts(): void {
	const pendingKey = useRef<null | string>(null);
	const pendingTimer = useRef<null | ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (tryModifierShortcut(e)) return;
			if (isInputFocused()) return;
			if (trySequenceShortcut(e, pendingKey, pendingTimer)) return;
			tryStartSequenceOrSingleKey(e, pendingKey, pendingTimer);
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			if (pendingTimer.current) {
				clearTimeout(pendingTimer.current);
				pendingTimer.current = null;
			}
		};
	}, []);
}

export { getShortcuts, registerShortcut, useKeyboardShortcuts };
export type { Shortcut };
