import { Copy } from 'lucide-react';
import { type FocusEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ShareDashboardDialogProps {
	isOpen: boolean;
	onCopy: () => void;
	onOpenChange: (open: boolean) => void;
	shareUrl: string;
}

// The share URL includes a 64-char hex token that overflows the Input's visible
// width. Auto-select the full value on focus so any manual copy (Ctrl+C after
// click, or test-automation reading the selection) receives the entire URL —
// not just the left-aligned visible prefix. The explicit Copy button is still
// the preferred path (it writes the full state value directly to the clipboard).
function selectFullUrl(event: FocusEvent<HTMLInputElement>) {
	event.currentTarget.select();
}

export function ShareDashboardDialog({
	isOpen,
	onCopy,
	onOpenChange,
	shareUrl,
}: ShareDashboardDialogProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Share Dashboard</DialogTitle>
					<DialogDescription>
						Anyone with this link can view this dashboard (read-only).
					</DialogDescription>
				</DialogHeader>
				<div className="flex gap-2 py-4">
					<Input
						aria-label="Share link URL"
						className="font-mono text-xs"
						onFocus={selectFullUrl}
						readOnly
						title={shareUrl}
						value={shareUrl}
					/>
					<Button
						aria-label="Copy share link"
						onClick={onCopy}
						size="icon"
						variant="outline">
						<Copy className="size-4" />
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
