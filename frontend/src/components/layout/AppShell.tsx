import { useQuery } from '@tanstack/react-query';
import { type ReactNode, lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';

import { CommandPalette } from '@/components/layout/CommandPalette';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import { ShortcutsHelp } from '@/components/layout/ShortcutsHelp';
import { SkipLink } from '@/components/layout/SkipLink';
import { BackendUnreachableBanner } from '@/components/shared/BackendUnreachableBanner';
import { Spinner } from '@/components/shared/Spinner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppShellShortcuts } from '@/hooks/layout/useAppShellShortcuts';
import { useLayoutEffects } from '@/hooks/layout/useLayoutEffects';
import { useAppFeatures } from '@/hooks/useAppFeatures';
import { useAuth } from '@/hooks/useAuth';
import { useCrudSocket } from '@/hooks/useCrudSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';
import { useWebSocket } from '@/hooks/useWebSocket';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { hasMinimumRole, type UserRole } from '@/types/roles';

import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const TerminalShell = lazy(() =>
	import('./shells/TerminalShell').then((m) => ({ default: m.TerminalShell }))
);
const BbsShell = lazy(() => import('./shells/BbsShell').then((m) => ({ default: m.BbsShell })));

// ---------------------------------------------------------------------------
// Layout variant components
// ---------------------------------------------------------------------------

function SuperThemeLayout({ superTheme }: { superTheme: 'bbs' | 'terminal' }) {
	const Shell = superTheme === 'terminal' ? TerminalShell : BbsShell;
	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen items-center justify-center">
					<Spinner className="text-muted-foreground" size={24} />
				</div>
			}>
			<Shell>
				<Outlet />
			</Shell>
		</Suspense>
	);
}

function TopBarLayout({ mainClasses }: { mainClasses: string }) {
	return (
		<div className="flex min-h-screen flex-col">
			<TopBar />
			<main className={mainClasses} id="main-content" tabIndex={-1}>
				<Outlet />
			</main>
		</div>
	);
}

function SidebarLayout({ mainClasses }: { mainClasses: string }) {
	const sidebarCollapsed = useSidebarStore((s) => s.collapsed);
	return (
		<div
			className={cn(
				'grid h-screen grid-rows-1 overflow-hidden transition-[grid-template-columns] duration-200',
				'grid-cols-[1fr]',
				sidebarCollapsed ? 'md:grid-cols-[4rem_1fr]' : 'md:grid-cols-[15rem_1fr]'
			)}>
			<div className="hidden md:flex">
				<Sidebar />
			</div>
			<div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
				<Header />
				<main className={mainClasses} id="main-content" tabIndex={-1}>
					<Outlet />
				</main>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Declarative layout resolver
// ---------------------------------------------------------------------------

interface LayoutConfig {
	layoutMode: 'sidebar' | 'topbar';
	superTheme: 'bbs' | 'default' | 'terminal';
}

function resolveLayout(config: LayoutConfig, mainClasses: string): ReactNode {
	if (config.superTheme !== 'default') {
		return <SuperThemeLayout superTheme={config.superTheme} />;
	}
	if (config.layoutMode === 'topbar') {
		return <TopBarLayout mainClasses={mainClasses} />;
	}
	return <SidebarLayout mainClasses={mainClasses} />;
}

// ---------------------------------------------------------------------------
// Shared frame wrapping all layout variants
// ---------------------------------------------------------------------------

interface AppShellFrameProps {
	canAccess: (requiredRole: undefined | UserRole) => boolean;
	children: ReactNode;
	onNavigate: (path: string) => void;
}

function AppShellFrame({ canAccess, children, onNavigate }: AppShellFrameProps) {
	return (
		<TooltipProvider>
			<SkipLink />
			<ImpersonationBanner />
			<BackendUnreachableBanner />
			{children}
			<CommandPalette canAccess={canAccess} onNavigate={onNavigate} />
			<ShortcutsHelp />
		</TooltipProvider>
	);
}

// ---------------------------------------------------------------------------
// Inner shell rendered only when authenticated
// ---------------------------------------------------------------------------

/**
 * Inner shell rendered only when authenticated.
 *
 * Initialises global hooks (WebSocket, keyboard shortcuts, notification socket,
 * CRUD event socket) and composes the layout based on the user's chosen layout mode.
 */
function AppShellContent() {
	const navigate = useNavigate();
	const userRole = useAuthStore((s) => s.user?.role ?? null);
	const layoutMode = useLayoutStore((s) => s.layoutMode);
	const containerWidth = useLayoutStore((s) => s.containerWidth);
	const layoutOverridden = useLayoutStore((s) => s.layoutOverridden);
	const { features: appFeatures, isAvailable: appFeaturesAvailable } = useAppFeatures();

	useKeyboardShortcuts();
	useWebSocket();
	useNotificationSocket();
	useCrudSocket();
	useAppShellShortcuts();
	useLayoutEffects(appFeatures);

	useEffect(() => {
		const removeRechartsMeasurementSpan = () => {
			document.getElementById('recharts_measurement_span')?.remove();
		};
		removeRechartsMeasurementSpan();

		const observer = new MutationObserver(removeRechartsMeasurementSpan);
		observer.observe(document.body, { childList: true });

		return () => observer.disconnect();
	}, []);

	const handleNavigate = (path: string) => {
		void navigate(path);
	};

	const canAccess = (requiredRole: undefined | UserRole): boolean => {
		if (!requiredRole) return true;
		if (!userRole) return false;
		return hasMinimumRole(userRole, requiredRole);
	};

	// Defer layout render until we know the correct mode to prevent flash
	// (sidebar → topbar) on first visit when the admin default differs.
	// Also wait for features to be available from the settings table (fail-closed).
	if (!layoutOverridden && !appFeaturesAvailable) {
		return null;
	}

	// Fail-closed: when features are unavailable, render sidebar layout with defaults
	const safeFeatures = appFeatures ?? {
		defaultLayoutMode: 'sidebar' as const,
		superTheme: 'default' as const,
	};

	const mainClasses = cn(
		'flex-1 overflow-y-auto',
		containerWidth === 'centered' && 'mx-auto w-full max-w-[95rem]'
	);

	const layout = resolveLayout({ layoutMode, superTheme: safeFeatures.superTheme }, mainClasses);

	return (
		<AppShellFrame canAccess={canAccess} onNavigate={handleNavigate}>
			{layout}
		</AppShellFrame>
	);
}

/**
 * Root layout component for authenticated pages.
 *
 * Redirects unauthenticated users to `/login` and renders
 * the layout shell (sidebar or topbar) otherwise.
 */
function AppShell() {
	const { checkSession } = useAuth();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const requiresPasswordChange = useAuthStore((s) => s.user?.requiresPasswordChange);

	const { data: isValid, isLoading } = useQuery({
		enabled: isAuthenticated,
		queryFn: () => checkSession(),
		queryKey: ['session-check'],
		retry: false,
		staleTime: STALE_TIME_SHORT,
		throwOnError: false,
	});

	if (!isAuthenticated) {
		return <Navigate replace to="/login" />;
	}

	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<Spinner className="text-muted-foreground" size={24} />
			</div>
		);
	}

	if (!isValid) {
		return <Navigate replace to="/login" />;
	}

	if (requiresPasswordChange) {
		return <Navigate replace to="/change-password" />;
	}

	return <AppShellContent />;
}

export { AppShell };
