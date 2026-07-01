import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export function statusIcon(status: string) {
	if (status === 'healthy')
		return <CheckCircle aria-hidden="true" className="size-4 text-green-500" />;
	if (status === 'degraded')
		return <AlertTriangle aria-hidden="true" className="size-4 text-yellow-500" />;
	return <XCircle aria-hidden="true" className="size-4 text-red-500" />;
}

export function statusBadgeClassName(status: string): string {
	if (status === 'healthy') return 'bg-green-500 text-white';
	if (status === 'degraded') return 'bg-yellow-500 text-white';
	return 'bg-red-500 text-white';
}
