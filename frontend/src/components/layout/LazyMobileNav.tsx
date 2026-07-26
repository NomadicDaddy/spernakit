import { Menu } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { Button } from '@/components/ui/button';

const MobileNav = lazy(() =>
	import('@/components/layout/MobileNav').then((module) => ({
		default: module.MobileNav,
	})),
);

/**
 * Defers the mobile-only drawer and its Radix Dialog dependency while preserving
 * the header's control footprint until the interactive chunk is ready.
 */
function LazyMobileNav() {
	return (
		<Suspense
			fallback={
				<Button
					aria-label="Navigation menu loading"
					className="md:hidden"
					disabled
					size="icon"
					variant="ghost">
					<Menu aria-hidden="true" className="size-5" />
				</Button>
			}>
			<MobileNav />
		</Suspense>
	);
}

export { LazyMobileNav };
