import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';

import type { DashboardExport } from '@/api/dashboards';

import {
	createDashboard,
	createFromTemplate,
	deleteDashboard,
	exportDashboard,
	importDashboard,
	listDashboards,
	listTemplates,
} from '@/api/dashboards';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface UseDashboardsOptions {
	onNavigate: (path: string) => void;
}

/** Parse and validate an imported dashboard JSON file. Returns null on validation failure. */
async function parseImportFile(file: File): Promise<DashboardExport | null> {
	const text = await file.text();

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		toast.error('Invalid JSON file — please check the file format');
		return null;
	}

	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		'__proto__' in parsed ||
		'constructor' in parsed ||
		'prototype' in parsed
	) {
		toast.error(
			'Invalid dashboard file. Ensure the file is a valid JSON export from this application.'
		);
		return null;
	}

	const obj = parsed as Record<string, unknown>;
	if (typeof obj.name !== 'string' || !Array.isArray(obj.widgets)) {
		toast.error('Invalid dashboard format: missing name or widgets');
		return null;
	}

	return parsed;
}

/**
 * Hook for dashboard queries and mutations.
 */
export function useDashboards({ onNavigate }: UseDashboardsOptions) {
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

	const { data: dashboards, isLoading } = useQuery({
		enabled: activeWorkspaceId !== null,
		queryFn: listDashboards,
		queryKey: ['dashboards', activeWorkspaceId],
	});

	const { data: templates } = useQuery({
		queryFn: listTemplates,
		queryKey: ['dashboard-templates'],
	});

	const createMutation = useMutation({
		mutationFn: (name: string) => createDashboard({ name }),
		onSuccess: (data) => {
			void queryClient.invalidateQueries({ queryKey: ['dashboards', activeWorkspaceId] });
			onNavigate(`/dashboards/${data.data.id}`);
			toast.success('Dashboard created');
		},
	});

	const templateMutation = useMutation({
		mutationFn: (templateId: string) => createFromTemplate(templateId),
		onSuccess: (data) => {
			void queryClient.invalidateQueries({ queryKey: ['dashboards', activeWorkspaceId] });
			onNavigate(`/dashboards/${data.data.id}`);
			toast.success('Dashboard created from template');
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => deleteDashboard(id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['dashboards', activeWorkspaceId] });
			toast.success('Dashboard deleted');
		},
	});

	async function handleExport(id: number) {
		try {
			const result = await exportDashboard(id);
			const blob = new Blob([JSON.stringify(result.data, null, 2)], {
				type: 'application/json',
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `dashboard-${id}.json`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success('Dashboard exported');
		} catch {
			toast.error('Failed to export dashboard. Try again or check your connection.');
		}
	}

	async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			const dashboard = await parseImportFile(file);
			if (!dashboard) return;
			const result = await importDashboard(dashboard);
			void queryClient.invalidateQueries({ queryKey: ['dashboards', activeWorkspaceId] });
			onNavigate(`/dashboards/${result.data.id}`);
			toast.success('Dashboard imported');
		} catch {
			toast.error('Failed to import dashboard. Verify the JSON file and try again.');
		}
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	}

	return {
		createMutation,
		dashboards,
		deleteMutation,
		fileInputRef,
		handleExport,
		handleImportFile,
		isLoading,
		templateMutation,
		templates,
	};
}
