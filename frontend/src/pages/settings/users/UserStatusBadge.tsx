import { AlertTriangle, Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFormatters } from '@/hooks/useFormatters';

interface UserStatusBadgeProps {
	failedLoginAttempts: null | number;
	lockedUntil: null | string;
}

export function UserStatusBadge({ failedLoginAttempts, lockedUntil }: UserStatusBadgeProps) {
	const { formatDateTime } = useFormatters();
	const isLocked = lockedUntil && new Date(lockedUntil) > new Date();
	const hasFailedAttempts = failedLoginAttempts && failedLoginAttempts > 0;

	if (isLocked) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Badge className="gap-1" variant="destructive">
							<Lock aria-hidden="true" className="size-3" />
							Locked
						</Badge>
					</TooltipTrigger>
					<TooltipContent>
						<p>Account locked until {formatDateTime(lockedUntil)}</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	if (hasFailedAttempts) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Badge className="gap-1" variant="secondary">
							<AlertTriangle aria-hidden="true" className="size-3" />
							{failedLoginAttempts} failed attempts
						</Badge>
					</TooltipTrigger>
					<TooltipContent>
						<p>Account has {failedLoginAttempts} failed login attempts</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return <Badge variant="outline">Active</Badge>;
}
