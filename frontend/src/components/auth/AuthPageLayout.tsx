import type { ReactNode } from 'react';

import { BackendUnreachableBanner } from '@/components/shared/BackendUnreachableBanner';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AuthPageLayoutProps {
	children: ReactNode;
	description?: string;
	title: ReactNode;
}

function AuthPageLayout({ children, description, title }: AuthPageLayoutProps) {
	return (
		<div className="bg-background relative flex min-h-screen items-center justify-center overflow-hidden px-4">
			{/* Ambient brand wash: two blurred radial blobs behind the card. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-40 -left-40 size-[32rem] rounded-full opacity-40 blur-3xl"
				style={{ background: 'var(--brand-gradient)' }}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -right-40 -bottom-40 size-[32rem] rounded-full opacity-30 blur-3xl"
				style={{ background: 'var(--brand-gradient)' }}
			/>
			{/* Subtle dot grid overlay. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 opacity-[0.35]"
				style={{
					backgroundImage:
						'radial-gradient(oklch(from var(--foreground) l c h / 6%) 1px, transparent 1px)',
					backgroundSize: '20px 20px',
				}}
			/>
			<div className="relative flex w-full max-w-sm flex-col">
				<BackendUnreachableBanner />
				<Card className="w-full" variant="elevated">
					<CardHeader className="text-center">
						<CardTitle className="text-display text-3xl">{title}</CardTitle>
						{description && <CardDescription>{description}</CardDescription>}
					</CardHeader>
					{children}
				</Card>
			</div>
		</div>
	);
}

export { AuthPageLayout };
