import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Progress({
	className,
	value,
	...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
	return (
		<ProgressPrimitive.Root
			className={cn(
				'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
				className,
			)}
			data-slot="progress"
			/*
			 * `value` reaches the Radix root, not only the indicator's transform. Upstream's snippet
			 * destructures it for the `translateX` and never forwards it, so every progress bar in
			 * the app rendered `data-state="indeterminate"` with no `aria-valuenow` — the fill moved
			 * on screen and the accessibility tree reported a bar of unknown progress. Found on
			 * /onboarding, where the checklist bar was switched to this component precisely for the
			 * progressbar semantics it was not in fact emitting. Affects StatCard and GaugeWidget
			 * too; neither styles off `data-state`, so the only change is that a determinate value
			 * now announces itself.
			 */
			value={value}
			{...props}>
			<ProgressPrimitive.Indicator
				className="h-full w-full flex-1 bg-primary transition-transform"
				data-slot="progress-indicator"
				style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
			/>
		</ProgressPrimitive.Root>
	);
}

export { Progress };
