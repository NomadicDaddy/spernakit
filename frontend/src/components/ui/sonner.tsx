'use client';

import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { Spinner } from '@/components/shared/Spinner';

function Toaster({ ...props }: ToasterProps) {
	return (
		<Sonner
			className="toaster group"
			icons={{
				error: <OctagonXIcon aria-hidden="true" className="size-4" />,
				info: <InfoIcon aria-hidden="true" className="size-4" />,
				loading: <Spinner size={16} />,
				success: <CircleCheckIcon aria-hidden="true" className="size-4" />,
				warning: <TriangleAlertIcon aria-hidden="true" className="size-4" />,
			}}
			style={
				{
					'--border-radius': 'var(--radius)',
					'--normal-bg': 'var(--popover)',
					'--normal-border': 'var(--border)',
					'--normal-text': 'var(--popover-foreground)',
				} as React.CSSProperties
			}
			theme="system"
			{...props}
		/>
	);
}

export { Toaster };
