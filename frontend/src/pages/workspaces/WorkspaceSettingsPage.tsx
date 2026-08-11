import type { TabItem } from '@/components/layout/TabLayout';

import { TabLayout } from '@/components/layout/TabLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Spinner } from '@/components/shared/Spinner';

import { useWorkspaceSettings } from './useWorkspaceSettings';

/**
 * Shell for the workspace settings tabs.
 *
 * The three panels used to be `@/components/ui/tabs` inside one page — the only place under
 * `pages/` that imported them, so this rail was a filled pill group with icons while every other
 * tabbed area in the app was TabLayout's underline rail. They are child routes now, which buys the
 * house rail, the overflow chevrons, and a tab state you can link to and reload into.
 *
 * The header says the workspace's name once and nothing else. It used to read
 * `Default — Settings` under a `Workspaces › Default › Settings` breadcrumb, beside a "Back to
 * Workspaces" outline button that duplicated the breadcrumb's first crumb — three ways of saying
 * where you are, one of them occupying the primary-action slot on a page that has no page-level
 * action. The breadcrumb carries the location and the "Settings" crumb carries the section.
 */
function WorkspaceSettingsPage() {
	const { canManage, isLoaded, workspace, workspaceId } = useWorkspaceSettings();

	if (!isLoaded && workspace === undefined) {
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
				<div className="py-8 text-center text-muted-foreground">
					{workspaceId ? 'Workspace not found.' : 'Invalid workspace ID.'}
				</div>
			</div>
		);
	}

	if (!canManage) {
		return (
			<div className="space-y-6 p-6">
				<PageHeader title="Workspace Settings" />
				<div className="py-8 text-center text-muted-foreground">
					You do not have permission to manage this workspace&apos;s settings.
				</div>
			</div>
		);
	}

	const base = `/workspaces/${String(workspaceId)}/settings`;
	const tabs: TabItem[] = [
		{ label: 'General', to: `${base}/general` },
		{ label: 'Branding', to: `${base}/branding` },
		{ label: 'Dashboard', to: `${base}/dashboard` },
	];

	return (
		<TabLayout
			breadcrumbs={[
				{ label: 'Workspaces', to: '/workspaces' },
				{ label: workspace.name },
				{ label: 'Settings' },
			]}
			description="Configure workspace-specific options."
			tabs={tabs}
			title={workspace.name}
		/>
	);
}

export { WorkspaceSettingsPage };
