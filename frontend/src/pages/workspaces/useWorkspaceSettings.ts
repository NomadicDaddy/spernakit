import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { toast } from 'sonner';

import type { WorkspaceSettings } from '@/api/types';

import { listWorkspaces, updateWorkspace } from '@/api/workspaces';
import { useAuthorization } from '@/hooks/useAuthorization';

/**
 * One tab's edit, where an explicit `null` means "clear this setting" and an absent key means
 * "leave it alone".
 *
 * The wire type cannot express the difference, and `save` needs it. Settings are stored as one
 * JSON object and `PUT /workspaces/:id` replaces that object whole, so `save` rebuilds it from the
 * stored values before merging a tab's fields in — which makes an omitted key indistinguishable
 * from an unchanged one. The dashboard tab offers "No default dashboard" and enables Save for it,
 * but omission was the only way it could say so, and the rebuilt base put the old id straight back
 * into the request. The setting could be changed and never removed; the select snapped back to the
 * previous dashboard on the next fetch.
 */
type WorkspaceSettingsChanges = {
	[K in keyof WorkspaceSettings]?: null | WorkspaceSettings[K];
};

/**
 * The workspace whose settings are being edited, plus a save that merges one tab's fields into
 * the whole settings object.
 *
 * Each settings tab is its own route now, so there is no parent component left to hold the
 * workspace and the mutation for all three. This hook is that shared piece: the `['workspaces']`
 * query is already cached, so calling it per tab costs nothing, and `save` still merges against
 * the *stored* settings rather than replacing them — a tab must not blank the fields the other
 * two tabs own.
 */
function useWorkspaceSettings() {
	const { id } = useParams<{ id: string }>();
	const workspaceId = id ? Number(id) : 0;
	const queryClient = useQueryClient();
	const { can } = useAuthorization();

	const { data: workspacesData } = useQuery({
		queryFn: listWorkspaces,
		queryKey: ['workspaces'],
	});
	const workspace = workspacesData?.data?.find((w) => w.id === workspaceId);
	const settings = workspace?.settings;

	const updateMutation = useMutation({
		mutationFn: (newSettings: WorkspaceSettings) =>
			updateWorkspace(workspaceId, { settings: newSettings }),
		onError: () => {
			toast.error('Failed to save settings', {
				description:
					'Check your network connection and try again. If the problem persists, contact your administrator.',
			});
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
			toast.success('Settings saved successfully');
		},
	});

	function save(changes: WorkspaceSettingsChanges) {
		const base: WorkspaceSettings = {
			...(settings?.branding ? { branding: settings.branding } : {}),
			...(settings?.currency ? { currency: settings.currency } : {}),
			...(settings?.defaultDashboardId !== null && settings?.defaultDashboardId !== undefined
				? { defaultDashboardId: settings.defaultDashboardId }
				: {}),
			...(settings?.timezone ? { timezone: settings.timezone } : {}),
		};
		// The API takes the settings object whole, so a cleared field has to leave as an absent key
		// rather than a null one; `null` is this hook's vocabulary, not the endpoint's.
		const next = Object.fromEntries(
			Object.entries({ ...base, ...changes }).filter(([, value]) => value !== null),
		) as WorkspaceSettings;
		updateMutation.mutate(next);
	}

	return {
		canManage: can('MANAGER') && (workspace?.ownerId !== undefined || can('ADMIN')),
		isLoaded: workspacesData !== undefined,
		isPending: updateMutation.isPending,
		save,
		settings,
		workspace,
		workspaceId,
	};
}

export { useWorkspaceSettings };
