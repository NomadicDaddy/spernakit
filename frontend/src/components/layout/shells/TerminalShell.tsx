import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';

import '@/styles/super-theme-terminal.css';
import { HeaderBarActions } from '@/components/layout/HeaderBarActions';

import { TerminalNav } from './TerminalNav';
import { useShellContext } from './useShellContext';

type TerminalShellProps = {
	children: React.ReactNode;
};

function TerminalShell({ children }: TerminalShellProps) {
	const { currentPath, handleBugReport, logout, username, visibleNavItems } = useShellContext();

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			{/* Top bar: prompt-style breadcrumb + controls */}
			<header className="border-border flex items-center gap-2 border-b px-4 py-2">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<span className="text-primary shrink-0 text-sm font-bold">
						{username.split('@')[0]}@{__APP_SLUG__}
					</span>
					<span className="text-muted-foreground text-sm">:</span>
					<span className="text-foreground truncate text-sm">~{currentPath}</span>
					<span className="text-primary text-sm">$</span>
				</div>

				<TerminalNav navItems={visibleNavItems} />

				<div className="flex shrink-0 items-center gap-1">
					<HeaderBarActions layoutActions={{ handleBugReport, handleLogout: logout }} />
				</div>
			</header>

			{/* Main content */}
			<main className="min-h-0 flex-1 overflow-y-auto" id="main-content" tabIndex={-1}>
				{children}
			</main>

			{/* Status bar */}
			<footer className="border-border text-muted-foreground flex items-center justify-between border-t px-4 py-1 text-xs">
				<span translate="no">{__APP_NAME__}</span>
				<span>{currentPath}</span>
				<span>{username}</span>
			</footer>
		</div>
	);
}

export { TerminalShell };
