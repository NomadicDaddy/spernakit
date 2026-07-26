import type { ReactNode } from 'react';

import { lazy, Suspense } from 'react';

import type { BugReport } from '@/lib/bugReport';

import {
	CommandPaletteLauncher,
	CommandPaletteLauncherMobile,
} from '@/components/layout/CommandPaletteLauncher';
import { UserMenu } from '@/components/layout/UserMenu';
import { useAppFeatures } from '@/hooks/useAppFeatures';

// Lazy-load NotificationBell so @radix-ui/react-popover (~3 KB gzip) stays off
// the critical path. The bell icon renders immediately via the Suspense
// fallback; the popover content only appears on click.
const LazyNotificationBell = lazy(() =>
	import('@/components/layout/NotificationBell').then((m) => ({
		default: m.NotificationBell,
	})),
);

// Lazy-load the bug report dialog so its tabs and form controls stay off the
// critical path. The feature query already gates this user-initiated control.
const LazyBugReportButton = lazy(() =>
	import('@/components/layout/BugReportButton').then((m) => ({
		default: m.BugReportButton,
	})),
);

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
			{bugReportEnabled && (
				<Suspense fallback={null}>
					<LazyBugReportButton onSubmit={layoutActions.handleBugReport} />
				</Suspense>
			)}
			<Suspense fallback={null}>
				<LazyNotificationBell />
			</Suspense>
			<UserMenu onLogout={layoutActions.handleLogout} />
		</>
	);
}

export { HeaderBarActions };
