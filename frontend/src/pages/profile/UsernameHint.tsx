import { Check, X } from 'lucide-react';

import type { UsernameStatus } from '@/hooks/useProfile';

import { Spinner } from '@/components/shared/Spinner';

interface UsernameHintProps {
	status: UsernameStatus;
}

export function UsernameHint({ status }: UsernameHintProps) {
	let content: React.ReactNode = null;

	switch (status) {
		case 'available':
			content = (
				<p className="flex items-center gap-1 text-xs text-success">
					<Check aria-hidden className="size-3" />
					Username is available
				</p>
			);
			break;
		case 'checking':
			content = (
				<p className="flex items-center gap-1 text-xs text-muted-foreground">
					<Spinner size={12} />
					Checking availability…
				</p>
			);
			break;
		case 'invalid':
			content = (
				<p className="text-xs text-muted-foreground">
					2-50 characters, letters, numbers, _ . - only
				</p>
			);
			break;
		case 'taken':
			content = (
				<p className="flex items-center gap-1 text-xs text-destructive">
					<X aria-hidden className="size-3" />
					Username is already taken
				</p>
			);
			break;
	}

	/*
	 * `min-h-4` reserves the line box. The idle state renders nothing, so the hint row did not
	 * exist until the field was touched — typing one character and letting the check settle
	 * inserted 16px and moved Save Changes from y=479 to y=495 and the whole card below it from
	 * y=701 to y=717. The button the user is reaching for shifted by half its own height at the
	 * exact moment the field validated. 16px matches the `text-xs` line box all four states use,
	 * so they now swap in place.
	 */
	return (
		<div aria-live="polite" className="min-h-4">
			{content}
		</div>
	);
}
