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
				<p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
					<Check aria-hidden className="size-3" />
					Username is available
				</p>
			);
			break;
		case 'checking':
			content = (
				<p className="text-muted-foreground flex items-center gap-1 text-xs">
					<Spinner size={12} />
					Checking availability…
				</p>
			);
			break;
		case 'invalid':
			content = (
				<p className="text-muted-foreground text-xs">
					2-50 characters, letters, numbers, _ . - only
				</p>
			);
			break;
		case 'taken':
			content = (
				<p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
					<X aria-hidden className="size-3" />
					Username is already taken
				</p>
			);
			break;
	}

	return <div aria-live="polite">{content}</div>;
}
