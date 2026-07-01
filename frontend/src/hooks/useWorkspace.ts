import { type Query, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Workspace } from '@/api/types';

import { listWorkspaces } from '@/api/workspaces';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const EMPTY_WORKSPACES: Workspace[] = [];

/**
 * Query keys that should NOT be invalidated when switching workspaces.
 * These are workspace-agnostic queries that don't depend on the active workspace.
 */
const WORKSPACE_AGNOSTIC_KEYS = new Set([
	'app-features',
	'auth',
	'demo-accounts',
	'notification-preferences',
	'oauth-providers',
	'profile',
	'registration-status',
	'session-check',
	'settings',
	'smtp-config',
	'user-settings',
	'user-ui-settings',
	'workspaces',
]);

/**
 * Hook providing workspace data, active workspace selection, and workspace switching.
 *
 * Fetches workspaces from API and auto-selects default workspace
 * when none is active. Switching workspaces invalidates workspace-scoped queries only.
 *
 * DESIGN: Workspaces list is derived from TanStack Query cache, not persisted
 * to Zustand store. Only activeWorkspaceId is persisted to avoid dual source of truth.
 */
function useWorkspace() {
	const queryClient = useQueryClient();
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
	const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);

	const { data } = useQuery({
		queryFn: listWorkspaces,
		queryKey: ['workspaces'],
		throwOnError: false,
	});

	const workspaces = data?.data ?? EMPTY_WORKSPACES;
	const workspacesLoaded = workspaces.length > 0;

	// Derive active workspace inline from current store + query data.
	// If the stored ID is valid, use it; otherwise fall back to default or first workspace.
	const storedWorkspace =
		activeWorkspaceId !== null
			? (workspaces.find((w) => w.id === activeWorkspaceId) ?? null)
			: null;
	const activeWorkspace: null | Workspace =
		storedWorkspace ?? workspaces.find((w) => w.isDefault) ?? workspaces[0] ?? null;
	const effectiveId = activeWorkspace?.id ?? null;

	// Persist the effective ID to the store so workspace selection survives page refreshes.
	// IMPORTANT: Skip reconciliation while workspaces are still loading (empty list).
	// A transient empty query during navigation/refetch would otherwise clobber a valid
	// persisted selection with the default-fallback id, causing the switcher to revert.
	// Only overwrite the stored id when we actually have data to reconcile against.
	const hasStoredWorkspace = activeWorkspaceId !== null && storedWorkspace !== null;
	useEffect(() => {
		if (!workspacesLoaded) return;
		// If the stored id is still present in the loaded list, keep it as-is.
		if (hasStoredWorkspace) return;
		// Otherwise (no selection yet, or stored id is no longer accessible) write the fallback.
		if (effectiveId !== activeWorkspaceId) {
			setActiveWorkspaceId(effectiveId);
		}
	}, [
		workspacesLoaded,
		hasStoredWorkspace,
		effectiveId,
		activeWorkspaceId,
		setActiveWorkspaceId,
	]);

	function switchWorkspace(id: number) {
		setActiveWorkspaceId(id);
		// Only touch workspace-scoped queries, preserve workspace-agnostic cache
		const isWorkspaceScoped = (query: Query) => {
			const key = query.queryKey[0];
			return typeof key === 'string' && !WORKSPACE_AGNOSTIC_KEYS.has(key);
		};
		// Cancel in-flight requests still carrying the old X-Workspace-ID before
		// invalidating, so their responses can't land as fresh data for the new workspace.
		void queryClient
			.cancelQueries({ predicate: isWorkspaceScoped })
			.then(() => queryClient.invalidateQueries({ predicate: isWorkspaceScoped }));
	}

	return {
		activeWorkspace,
		activeWorkspaceId: effectiveId,
		switchWorkspace,
		workspaces,
	};
}

export { useWorkspace };
