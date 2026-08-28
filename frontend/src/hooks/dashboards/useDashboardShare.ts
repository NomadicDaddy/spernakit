import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { ShareState } from '@/api/dashboards';

import { getDashboardShareState, revokeDashboardShare, shareDashboard } from '@/api/dashboards';

interface UseDashboardShareOptions {
	dashboardId: number;
	/** Only ADMIN+ may read or change a share link, so the state query stays off for everyone else. */
	enabled: boolean;
	/** Called with the link to show once a share succeeds. */
	onShared: (url: string, expiresAt: string) => void;
}

/**
 * Owns everything about a dashboard's share link: whether one is live, creating one, and
 * revoking it.
 *
 * Whether a link is live is read from the server rather than worked out here from the token and
 * the expiry on the dashboard record. The server has to make that judgment anyway, for the public
 * fetch and for deciding whether a repeat share reuses the token, and a second copy of the rule in
 * the client is how the two come to disagree.
 */
export function useDashboardShare({ dashboardId, enabled, onShared }: UseDashboardShareOptions) {
	const queryClient = useQueryClient();
	const shareStateKey = ['dashboard-share', dashboardId];

	const { data: shareStateResult } = useQuery({
		enabled: enabled && !Number.isNaN(dashboardId),
		queryFn: () => getDashboardShareState(dashboardId),
		queryKey: shareStateKey,
	});

	const shareState: ShareState | undefined = shareStateResult?.data;

	const shareMutation = useMutation({
		mutationFn: () => shareDashboard(dashboardId),
		onSuccess: (result) => {
			void queryClient.invalidateQueries({ queryKey: shareStateKey });
			onShared(
				`${window.location.origin}/dashboards/shared/${result.data.shareToken}`,
				result.data.shareExpiresAt,
			);
			/*
			 * The endpoint deliberately reuses an existing live token rather than rotating it, so a
			 * fixed "Share link generated" reported an action that had not happened and implied the
			 * link already handed out might have been replaced. The share state answers which of
			 * the two happened, using the same liveness rule the server reused the token under.
			 */
			toast.success(shareState?.isActive ? 'Share link ready' : 'Share link created');
		},
	});

	const revokeMutation = useMutation({
		mutationFn: () => revokeDashboardShare(dashboardId),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: shareStateKey });
			void queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
			toast.success('Share link revoked');
		},
	});

	return {
		isRevoking: revokeMutation.isPending,
		isSharing: shareMutation.isPending,
		revoke: () => revokeMutation.mutate(),
		share: () => shareMutation.mutate(),
		shareState,
	};
}
