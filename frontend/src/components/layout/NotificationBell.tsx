import { Bell } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useHeader } from '@/hooks/layout/useHeader';
import { useFormatters } from '@/hooks/useFormatters';

/**
 * Notification bell component with dropdown showing recent notifications.
 */
export function NotificationBell() {
	const { recentNotifications, unreadCount } = useHeader();
	const { formatTimestamp } = useFormatters();

	// Announce unread count changes to screen readers, but only on increase —
	// announcing decreases (e.g. mark-as-read) would just be noise.
	const [announcement, setAnnouncement] = useState('');
	const [prevUnreadCount, setPrevUnreadCount] = useState(unreadCount);
	if (unreadCount !== prevUnreadCount) {
		setPrevUnreadCount(unreadCount);
		if (unreadCount > prevUnreadCount) {
			setAnnouncement(
				unreadCount === 1 ? '1 unread notification' : `${unreadCount} unread notifications`
			);
		}
	}

	return (
		<>
			<span aria-live="polite" className="sr-only">
				{announcement}
			</span>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						aria-label={
							unreadCount > 0
								? `Notifications (${unreadCount} unread)`
								: 'Notifications'
						}
						className="relative"
						size="icon"
						variant="ghost">
						<Bell aria-hidden="true" className="size-5" />
						{unreadCount > 0 && (
							<Badge
								aria-hidden="true"
								className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center p-0 text-xs"
								variant="destructive">
								{unreadCount > 99 ? '99+' : unreadCount}
							</Badge>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-80 p-0">
					<div className="border-b px-4 py-3">
						<p className="text-sm font-medium">Notifications</p>
						{unreadCount > 0 && (
							<p className="text-muted-foreground text-xs">{unreadCount} unread</p>
						)}
					</div>
					<div className="max-h-64 overflow-y-auto">
						{recentNotifications?.data && recentNotifications.data.length > 0 ? (
							recentNotifications.data.map((notification) => (
								<Link
									className="hover:bg-muted flex w-full items-start gap-3 px-4 py-3 text-left"
									key={notification.id}
									to="/notifications">
									<span
										className={`mt-1 block size-2 shrink-0 rounded-full ${
											notification.readAt ? 'bg-transparent' : 'bg-primary'
										}`}
									/>
									<div className="min-w-0 flex-1">
										<p
											className={`truncate text-sm ${
												notification.readAt
													? 'text-muted-foreground'
													: 'font-medium'
											}`}>
											{notification.title}
										</p>
										<p className="text-muted-foreground truncate text-xs">
											{notification.message}
										</p>
										<p className="text-muted-foreground mt-0.5 text-xs">
											{formatTimestamp(notification.createdAt)}
										</p>
									</div>
								</Link>
							))
						) : (
							<div className="px-4 py-6 text-center">
								<p className="text-muted-foreground text-sm">No notifications</p>
							</div>
						)}
					</div>
					<div className="border-t px-4 py-2">
						<Button asChild className="w-full" size="sm" variant="ghost">
							<Link to="/notifications">View all notifications</Link>
						</Button>
					</div>
				</PopoverContent>
			</Popover>
		</>
	);
}
