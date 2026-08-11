import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { toast } from 'sonner';

import type { WorkspaceSettings } from '@/api/types';

import { listWorkspaces, updateWorkspace } from '@/api/workspaces';
import { useAuthorization } from '@/hooks/useAuthorization';

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

	function save(changes: WorkspaceSettings) {
		const base: WorkspaceSettings = {
			...(settings?.branding ? { branding: settings.branding } : {}),
			...(settings?.currency ? { currency: settings.currency } : {}),
			...(settings?.defaultDashboardId !== null && settings?.defaultDashboardId !== undefined
				? { defaultDashboardId: settings.defaultDashboardId }
				: {}),
			...(settings?.timezone ? { timezone: settings.timezone } : {}),
		};
		updateMutation.mutate({ ...base, ...changes });
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
