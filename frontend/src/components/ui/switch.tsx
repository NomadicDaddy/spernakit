import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Switch({
	className,
	size = 'default',
	...props
}: {
	size?: 'default' | 'sm';
} & React.ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			className={cn(
				'peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80',
				/*
				 * The track is 18.4px tall at the default size and 14px at `sm`, so the control the
				 * pointer has to hit is well under the 24x24 minimum target (WCAG 2.2 SC 2.5.8) —
				 * six instances of it on /profile/preferences alone. This grows the hit area to 24px
				 * tall without touching the track: the pseudo-element is centred on the switch, has
				 * no paint of its own, and is out of flow, so nothing around it moves and the switch
				 * looks exactly as it did. Width is already 32px (24px at `sm`), so only the vertical
				 * axis needs the help.
				 */
				"before:absolute before:inset-x-0 before:top-1/2 before:h-6 before:-translate-y-1/2 before:content-['']",
				className,
			)}
			data-size={size}
			data-slot="switch"
			{...props}>
			<SwitchPrimitive.Thumb
				className={cn(
					'pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground',
				)}
				data-slot="switch-thumb"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
