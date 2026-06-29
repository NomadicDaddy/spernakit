import type { Dispatch, SetStateAction } from 'react';

import { Save } from 'lucide-react';

import type { DashboardConfig } from '@/api/dashboards';

import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

interface DashboardFormData {
	defaultDashboardId: null | number;
}

interface WorkspaceDashboardTabProps {
	dashboards: DashboardConfig[];
	form: DashboardFormData;
	isPending: boolean;
	onSave: () => void;
	setForm: Dispatch<SetStateAction<DashboardFormData>>;
}

function WorkspaceDashboardTab({
	dashboards,
	form,
	isPending,
	onSave,
	setForm,
}: WorkspaceDashboardTabProps) {
	return (
		<div className="max-w-lg space-y-4">
			<div className="space-y-2">
				<Label htmlFor="ws-settings-dashboard">Default Dashboard</Label>
				<Select
					onValueChange={(val) =>
						setForm((prev) => ({
							...prev,
							defaultDashboardId: val === '__none__' ? null : Number(val),
						}))
					}
					value={
						form.defaultDashboardId !== null
							? String(form.defaultDashboardId)
							: '__none__'
					}>
					<SelectTrigger id="ws-settings-dashboard">
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
				<p className="text-muted-foreground text-xs">
					The dashboard shown by default when viewing this workspace.
				</p>
			</div>

			<Button disabled={isPending} onClick={onSave}>
				{isPending ? (
					<Spinner className="mr-2" size={16} />
				) : (
					<Save className="mr-2 h-4 w-4" />
				)}
				Save Dashboard
			</Button>
		</div>
	);
}

export { WorkspaceDashboardTab };
export type { DashboardFormData };
