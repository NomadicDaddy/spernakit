import type { Blocker } from 'react-router-dom';

import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warns the user before navigating away when there are unsaved changes.
 * Handles both browser navigation (beforeunload) and client-side routing (useBlocker).
 *
 * Returns the blocker so consumers can render a confirmation dialog
 * when `blocker.state === 'blocked'`.
 *
 * @param isDirty - Whether the form has unsaved changes
 */
function useUnsavedChanges(isDirty: boolean): Blocker {
	useBeforeUnload(isDirty);

	// Client-side navigation via React Router
	return useBlocker(isDirty);
}

/**
 * Warns the user via the browser's native beforeunload dialog when there are
 * unsaved changes. Does NOT register a React Router blocker — use this in child
 * components when a parent already owns the single useBlocker.
 *
 * @param isDirty - Whether the form has unsaved changes
 */
function useBeforeUnload(isDirty: boolean): void {
	useEffect(() => {
		if (!isDirty) return;

		function handleBeforeUnload(e: BeforeUnloadEvent) {
			e.preventDefault();
			e.returnValue = '';
		}

		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	}, [isDirty]);
}

export { useBeforeUnload, useUnsavedChanges };
