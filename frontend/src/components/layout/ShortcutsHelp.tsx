import { useEffect, useState } from 'react';

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { getShortcuts } from '@/hooks/useKeyboardShortcuts';

/** Dialog listing all registered keyboard shortcuts. Opened via the `?` key. */
function ShortcutsHelp() {
	const [open, setOpen] = useState(false);

	const items = open ? getShortcuts() : [];

	// Expose open function globally so keyboard handler can trigger it
	useEffect(() => {
		function handleOpen() {
			setOpen(true);
		}
		window.addEventListener('shortcuts-help:open', handleOpen);
		return () => {
			window.removeEventListener('shortcuts-help:open', handleOpen);
		};
	}, []);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Keyboard Shortcuts</DialogTitle>
					<DialogDescription>
						Available keyboard shortcuts for quick navigation and actions.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-1">
					{items.map((shortcut) => (
						<div className="flex items-center justify-between py-2" key={shortcut.key}>
							<span className="text-sm">{shortcut.description}</span>
							<kbd className="bg-muted rounded px-2 py-1 font-mono text-xs">
								{shortcut.label}
							</kbd>
						</div>
					))}
					{items.length === 0 && (
						<p className="text-muted-foreground text-sm">No shortcuts registered.</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

export { ShortcutsHelp };
