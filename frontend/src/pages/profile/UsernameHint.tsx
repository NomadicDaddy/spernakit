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

	return <div aria-live="polite">{content}</div>;
}
