import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface SpinnerProps {
	className?: string;
	/** Pixel size of the icon. Defaults to 16. */
	size?: number;
}

/**
 * GPU-accelerated loading spinner. Wraps the icon in a `will-change: transform`
 * + `translateZ(0)` layer so the rotation runs on the compositor thread.
 */
function Spinner({ className, size = 16 }: SpinnerProps) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'inline-flex [transform:translateZ(0)] animate-spin [will-change:transform]',
				className
			)}>
			<Loader2 style={{ height: size, width: size }} />
		</span>
	);
}

export { Spinner };
