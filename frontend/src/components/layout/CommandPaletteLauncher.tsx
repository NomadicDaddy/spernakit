import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCommandStore } from '@/stores/commandStore';

/** Detect the Apple modifier key for the keyboard hint badge. */
function isApplePlatform(): boolean {
	if (typeof navigator === 'undefined') return false;
	const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData
		?.platform;
	if (typeof platform === 'string') {
		return /mac|ios|iphone|ipad/i.test(platform);
	}
	return /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? '');
}

/**
 * Visible click-launcher for the command palette.
 *
 * Mirrors the Ctrl+K / Cmd+K shortcut so mouse users and accessibility tools
 * can discover and open the palette without memorizing the chord. Collapses
 * to an icon-only button on narrow viewports (<640px).
 */
function CommandPaletteLauncher() {
	const open = useCommandStore((s) => s.open);
	const modifier = isApplePlatform() ? '\u2318' : 'Ctrl';

	return (
		<Button
			aria-label="Open command palette"
			className="hidden h-9 items-center gap-2 px-3 sm:inline-flex"
			onClick={open}
			variant="outline">
			<Search aria-hidden="true" className="size-4" />
			<span className="text-muted-foreground text-sm">Search…</span>
			<kbd className="bg-muted text-muted-foreground ml-2 inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px]">
				{modifier} K
			</kbd>
		</Button>
	);
}

/** Icon-only variant shown on narrow viewports. */
function CommandPaletteLauncherMobile() {
	const open = useCommandStore((s) => s.open);
	return (
		<Button
			aria-label="Open command palette"
			className="sm:hidden"
			onClick={open}
			size="icon"
			variant="ghost">
			<Search aria-hidden="true" className="size-4" />
		</Button>
	);
}

export { CommandPaletteLauncher, CommandPaletteLauncherMobile };
