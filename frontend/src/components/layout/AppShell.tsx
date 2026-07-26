import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { lazy, Suspense } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';

import { SkipLink } from '@/components/layout/SkipLink';
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
import { useCommandStore } from '@/stores/commandStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { hasMinimumRole, type UserRole } from '@/types/roles';

import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

// Lazy-load the CommandPalette so cmdk (~5 KB gzip) and its radix-dialog
// dependency stay off the critical path. The palette only renders when opened
// via Ctrl+K / Cmd+K, so a dynamic import adds no latency to first paint.
const LazyCommandPalette = lazy(() =>
	import('@/components/layout/CommandPalette').then((m) => ({
		default: m.CommandPalette,
	})),
);

// Lazy-load ShortcutsHelp — it only renders when the user presses `?`, so
// deferring it keeps its radix-dialog usage from adding to the eager graph
// (MobileNav already pulls react-dialog in via Sheet, so this is a minor win).
const LazyShortcutsHelp = lazy(() =>
	import('@/components/layout/ShortcutsHelp').then((m) => ({
		default: m.ShortcutsHelp,
	})),
);

// Lazy-load BackendUnreachableBanner — it renders nothing until the liveness
// probe fails, so deferring it keeps its useBackendLiveness query out of the
// entry chunk.
const LazyBackendUnreachableBanner = lazy(() =>
	import('@/components/shared/BackendUnreachableBanner').then((m) => ({
		default: m.BackendUnreachableBanner,
	})),
);

// Lazy-load ImpersonationBanner — it renders nothing unless the current user
// is being impersonated, so deferring it keeps the stopImpersonating API call
// and its lazy-toast dependency off the critical path.
const LazyImpersonationBanner = lazy(() =>
	import('@/components/layout/ImpersonationBanner').then((m) => ({
		default: m.ImpersonationBanner,
	})),
);

// ---------------------------------------------------------------------------
// Layout variant components
// ---------------------------------------------------------------------------

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
				sidebarCollapsed ? 'md:grid-cols-[4rem_1fr]' : 'md:grid-cols-[15rem_1fr]',
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
}

function resolveLayout(config: LayoutConfig, mainClasses: string): ReactNode {
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
	const commandPaletteOpen = useCommandStore((s) => s.isOpen);
	return (
		<TooltipProvider>
			<SkipLink />
			<Suspense fallback={null}>
				<LazyImpersonationBanner />
			</Suspense>
			<Suspense fallback={null}>
				<LazyBackendUnreachableBanner />
			</Suspense>
			{children}
			{commandPaletteOpen && (
				<Suspense fallback={null}>
					<LazyCommandPalette canAccess={canAccess} onNavigate={onNavigate} />
				</Suspense>
			)}
			<Suspense fallback={null}>
				<LazyShortcutsHelp />
			</Suspense>
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

	const mainClasses = cn(
		'flex-1 overflow-y-auto',
		containerWidth === 'centered' && 'mx-auto w-full max-w-[95rem]',
	);

	const layout = resolveLayout({ layoutMode }, mainClasses);

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
