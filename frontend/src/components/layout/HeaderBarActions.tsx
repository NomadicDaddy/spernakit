import type { ReactNode } from 'react';

import type { BugReport } from '@/lib/bugReport';

import { BugReportButton } from '@/components/layout/BugReportButton';
import {
	CommandPaletteLauncher,
	CommandPaletteLauncherMobile,
} from '@/components/layout/CommandPaletteLauncher';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { UserMenu } from '@/components/layout/UserMenu';
import { useAppFeatures } from '@/hooks/useAppFeatures';

interface HeaderBarActionsProps {
	extraContent?: ReactNode;
	layoutActions: {
		handleBugReport: (report: BugReport) => Promise<void>;
		handleLogout: () => Promise<void>;
	};
}

/**
 * Shared right-side action bar: bug report, notifications, user menu.
 *
 * Consumed by Header, TopBar, and shell layouts to avoid duplicating
 * the bug-report / notification / user-menu composition in each variant.
 *
 * `extraContent` is an optional extensibility slot rendered before the
 * built-in actions, allowing derived apps to inject their own controls
 * (e.g. workspace switchers, selectors) without forking this component.
 */
function HeaderBarActions({ extraContent, layoutActions }: HeaderBarActionsProps) {
	const { features: appFeatures } = useAppFeatures();

	// Fail-closed: hide bug report when features are unavailable
	const bugReportEnabled = appFeatures?.bugReportEnabled ?? false;

	return (
		<>
			{extraContent}
			<CommandPaletteLauncher />
			<CommandPaletteLauncherMobile />
			{bugReportEnabled && <BugReportButton onSubmit={layoutActions.handleBugReport} />}
			<NotificationBell />
			<UserMenu onLogout={layoutActions.handleLogout} />
		</>
	);
}

export { HeaderBarActions };
