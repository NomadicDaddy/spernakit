import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useState } from 'react';

import { listDashboards } from '@/api/dashboards';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useWorkspaceStore } from '@/stores/workspaceStore';

import { useWorkspaceSettings } from './useWorkspaceSettings';

function WorkspaceDashboardTab() {
	const { isPending, save, settings } = useWorkspaceSettings();
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
	const storedDashboardId = settings?.defaultDashboardId ?? null;
	const [defaultDashboardId, setDefaultDashboardId] = useState<null | number>(storedDashboardId);

	// Re-seed the draft when the stored value arrives or changes — see WorkspaceGeneralTab.
	const [syncedFrom, setSyncedFrom] = useState(storedDashboardId);
	if (storedDashboardId !== syncedFrom) {
		setSyncedFrom(storedDashboardId);
		setDefaultDashboardId(storedDashboardId);
	}

	const isDirty = defaultDashboardId !== storedDashboardId;

	const { data: dashboardsData } = useQuery({
		enabled: activeWorkspaceId !== null,
		queryFn: listDashboards,
		queryKey: ['dashboards', activeWorkspaceId],
	});
	const dashboards = dashboardsData?.data ?? [];

	return (
		<Card>
			<CardContent>
				<div className="space-y-6">
					{/*
					 * The same two-column grid as the other two tabs even though this tab has one
					 * field — a lone select that spans the whole card would make this tab look like
					 * a different kind of form from its two siblings.
					 */}
					<div className="grid gap-6 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="ws-settings-dashboard">Default Dashboard</Label>
							<Select
								onValueChange={(val) =>
									setDefaultDashboardId(val === '__none__' ? null : Number(val))
								}
								value={
									defaultDashboardId !== null
										? String(defaultDashboardId)
										: '__none__'
								}>
								<SelectTrigger className="w-full" id="ws-settings-dashboard">
									<SelectValue placeholder="Select default dashboard" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__none__">None</SelectItem>
									{dashboards.map((d) => (
										<SelectItem key={d.id} value={String(d.id)}>
											{d.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{/* The helper here restated the label; see WorkspaceGeneralTab. */}
						</div>
					</div>

					<Button
						disabled={isPending || !isDirty}
						onClick={() =>
							save(defaultDashboardId !== null ? { defaultDashboardId } : {})
						}>
						{isPending ? (
							<Spinner size={16} />
						) : (
							<Save aria-hidden="true" className="size-4" />
						)}
						Save changes
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export { WorkspaceDashboardTab };
