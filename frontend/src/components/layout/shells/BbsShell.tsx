import '@fontsource/vt323/400.css';

import '@/styles/super-theme-bbs.css';
import { HeaderBarActions } from '@/components/layout/HeaderBarActions';

import { BbsFrame } from './BbsFrame';
import { BbsNav } from './BbsNav';
import { useShellContext } from './useShellContext';

type BbsShellProps = {
	children: React.ReactNode;
};

function BbsShell({ children }: BbsShellProps) {
	const { currentPath, handleBugReport, logout, username, visibleNavItems } = useShellContext();

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			{/* BBS header with ASCII art app name */}
			<header className="border-border border-b px-4 py-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<span
							className="text-primary text-lg font-bold tracking-widest"
							translate="no">
							{'>>>'} {__APP_NAME__.toUpperCase()} {'<<<'}
						</span>
					</div>

					<div className="flex items-center gap-1">
						<BbsNav navItems={visibleNavItems} />
						<HeaderBarActions
							layoutActions={{ handleBugReport, handleLogout: logout }}
						/>
					</div>
				</div>
			</header>

			{/* Main content with BBS frame */}
			<main
				className="min-h-0 flex-1 overflow-y-auto p-2 md:p-4"
				id="main-content"
				tabIndex={-1}>
				<BbsFrame title={currentPath}>{children}</BbsFrame>
			</main>

			{/* BBS status bar */}
			<footer className="border-border text-muted-foreground flex items-center justify-between border-t px-4 py-1 text-xs">
				<span>SysOp: {username.split('@')[0]}</span>
				<span>Node: {currentPath}</span>
				<span translate="no">{__APP_NAME__} BBS v1.0</span>
			</footer>
		</div>
	);
}

export { BbsShell };
