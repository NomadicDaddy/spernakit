import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LayoutDashboard, Palette, Settings } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { DashboardConfig } from '@/api/dashboards';
import type { WorkspaceSettings } from '@/api/types';

import { listDashboards } from '@/api/dashboards';
import { uploadFile } from '@/api/files';
import { listWorkspaces, updateWorkspace } from '@/api/workspaces';
import { PageHeader } from '@/components/shared/PageHeader';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useWorkspaceStore } from '@/stores/workspaceStore';

import type { BrandingFormData } from './WorkspaceBrandingTab';
import type { DashboardFormData } from './WorkspaceDashboardTab';
import type { GeneralFormData } from './WorkspaceGeneralTab';

import { WorkspaceBrandingTab } from './WorkspaceBrandingTab';
import { WorkspaceDashboardTab } from './WorkspaceDashboardTab';
import { WorkspaceGeneralTab } from './WorkspaceGeneralTab';

function WorkspaceSettingsPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { can } = useAuthorization();
	const queryClient = useQueryClient();
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
	const workspaceId = id ? Number(id) : 0;

	const { data: workspacesData } = useQuery({
		queryFn: listWorkspaces,
		queryKey: ['workspaces'],
	});
	const workspace = workspacesData?.data?.find((w) => w.id === workspaceId);

	const { data: dashboardsData } = useQuery({
		enabled: activeWorkspaceId !== null,
		queryFn: listDashboards,
		queryKey: ['dashboards', activeWorkspaceId],
	});
	const dashboards: DashboardConfig[] = dashboardsData?.data ?? [];

	const canManage = can('MANAGER') && (workspace?.ownerId !== undefined || can('ADMIN'));

	const settings = workspace?.settings;

	const initialGeneral: GeneralFormData = {
		currency: settings?.currency ?? '',
		timezone: settings?.timezone ?? '',
	};
	const initialBranding: BrandingFormData = {
		accentColor: settings?.branding?.accentColor ?? '#6366f1',
		logoFileId: settings?.branding?.logoFileId ?? null,
	};
	const initialDashboard: DashboardFormData = {
		defaultDashboardId: settings?.defaultDashboardId ?? null,
	};

	const [generalForm, setGeneralForm] = useState<GeneralFormData>(initialGeneral);
	const [brandingForm, setBrandingForm] = useState<BrandingFormData>(initialBranding);
	const [dashboardForm, setDashboardForm] = useState<DashboardFormData>(initialDashboard);

	const uploadMutation = useMutation({
		mutationFn: (file: File) => uploadFile(file),
		onError: () => {
			toast.error('Failed to upload logo', {
				description:
					'Check that the file is a valid image under the size limit and try again.',
			});
		},
		onSuccess: (response) => {
			const fileId = response.data.id;
			setBrandingForm((prev) => ({ ...prev, logoFileId: fileId }));
			toast.success('Logo uploaded successfully');
		},
	});

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

	const handleSave = (formType: 'branding' | 'dashboard' | 'general') => {
		const base: WorkspaceSettings = {
			...(settings?.branding ? { branding: settings.branding } : {}),
			...(settings?.currency ? { currency: settings.currency } : {}),
			...(settings?.defaultDashboardId !== null && settings?.defaultDashboardId !== undefined
				? { defaultDashboardId: settings.defaultDashboardId }
				: {}),
			...(settings?.timezone ? { timezone: settings.timezone } : {}),
		};

		let result: WorkspaceSettings;
		if (formType === 'general') {
			result = {
				...base,
				...(generalForm.currency ? { currency: generalForm.currency } : {}),
				...(generalForm.timezone ? { timezone: generalForm.timezone } : {}),
			};
		} else if (formType === 'branding') {
			result = {
				...base,
				branding: {
					accentColor: brandingForm.accentColor,
					...(brandingForm.logoFileId !== null
						? { logoFileId: brandingForm.logoFileId }
						: {}),
				},
			};
		} else {
			result = {
				...base,
				...(dashboardForm.defaultDashboardId !== null
					? { defaultDashboardId: dashboardForm.defaultDashboardId }
					: {}),
			};
		}

		updateMutation.mutate(result);
	};

	if (workspace === undefined && workspacesData === undefined) {
		return (
			<div className="space-y-6 p-6">
				<PageHeader title="Workspace Settings" />
				<div className="flex justify-center py-8">
					<Spinner className="text-muted-foreground" size={24} />
				</div>
			</div>
		);
	}

	if (!workspace) {
		return (
			<div className="space-y-6 p-6">
				<PageHeader title="Workspace Settings" />
				<div className="text-muted-foreground py-8 text-center">
					{workspaceId ? 'Workspace not found.' : 'Invalid workspace ID.'}
				</div>
			</div>
		);
	}

	if (!canManage) {
		return (
			<div className="space-y-6 p-6">
				<PageHeader title="Workspace Settings" />
				<div className="text-muted-foreground py-8 text-center">
					You do not have permission to manage this workspace&apos;s settings.
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6 p-6">
			<PageHeader
				breadcrumbs={[
					{ label: 'Workspaces', to: '/workspaces' },
					{ label: workspace.name },
					{ label: 'Settings' },
				]}
				title={`${workspace.name} — Settings`}>
				<Button
					onClick={() => {
						void navigate('/workspaces');
					}}
					size="sm"
					variant="outline">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back to Workspaces
				</Button>
			</PageHeader>

			<div className="text-muted-foreground mb-4 text-sm">
				Configure workspace-specific options. Changes are saved per tab.
			</div>

			<Tabs defaultValue="general">
				<TabsList>
					<TabsTrigger value="general">
						<Settings className="mr-2 h-4 w-4" />
						General
					</TabsTrigger>
					<TabsTrigger value="branding">
						<Palette className="mr-2 h-4 w-4" />
						Branding
					</TabsTrigger>
					<TabsTrigger value="dashboard">
						<LayoutDashboard className="mr-2 h-4 w-4" />
						Dashboard
					</TabsTrigger>
				</TabsList>

				<TabsContent className="mt-6 space-y-6" value="general">
					<WorkspaceGeneralTab
						form={generalForm}
						isPending={updateMutation.isPending}
						onSave={() => handleSave('general')}
						setForm={setGeneralForm}
					/>
				</TabsContent>

				<TabsContent className="mt-6 space-y-6" value="branding">
					<WorkspaceBrandingTab
						form={brandingForm}
						isPending={updateMutation.isPending}
						isUploading={uploadMutation.isPending}
						onSave={() => handleSave('branding')}
						onUpload={(file) => uploadMutation.mutate(file)}
						setForm={setBrandingForm}
					/>
				</TabsContent>

				<TabsContent className="mt-6 space-y-6" value="dashboard">
					<WorkspaceDashboardTab
						dashboards={dashboards}
						form={dashboardForm}
						isPending={updateMutation.isPending}
						onSave={() => handleSave('dashboard')}
						setForm={setDashboardForm}
					/>
				</TabsContent>
			</Tabs>

			<div className="text-muted-foreground text-sm">
				<Link className="hover:text-foreground underline" to="/workspaces">
					← Back to all workspaces
				</Link>
			</div>
		</div>
	);
}

export { WorkspaceSettingsPage };
