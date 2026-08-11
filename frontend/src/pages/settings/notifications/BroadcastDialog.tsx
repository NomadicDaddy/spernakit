import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { broadcastNotification, type BroadcastNotificationData } from '@/api/notifications';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Broadcast severities, each with the semantic token the app already spends on that state.
 *
 * The select used to list four bare words, so an operator picked a severity without seeing the
 * colour every recipient would get — the one thing the choice actually decides.
 */
const BROADCAST_TYPES: { dot: string; label: string; value: string }[] = [
	{ dot: 'bg-primary', label: 'Info', value: 'info' },
	{ dot: 'bg-warning', label: 'Warning', value: 'warning' },
	{ dot: 'bg-destructive', label: 'Error', value: 'error' },
	{ dot: 'bg-success', label: 'Success', value: 'success' },
];

interface BroadcastDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}

export function BroadcastDialog({ isOpen, onOpenChange }: BroadcastDialogProps) {
	const queryClient = useQueryClient();
	const [title, setTitle] = useState('');
	const [message, setMessage] = useState('');
	const [type, setType] = useState('info');

	const mutation = useMutation({
		mutationFn: (data: BroadcastNotificationData) => broadcastNotification(data),
		onError: () => toast.error('Failed to send broadcast notification. Please try again.'),
		onSuccess: (response) => {
			void queryClient.invalidateQueries({ queryKey: ['notifications'] });
			void queryClient.invalidateQueries({ queryKey: ['notification-statistics'] });
			void queryClient.invalidateQueries({ queryKey: ['unread-count'] });
			toast.success(`Broadcast sent to ${response.data.count} users`);
			setTitle('');
			setMessage('');
			setType('info');
			onOpenChange(false);
		},
	});

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!title.trim() || !message.trim()) return;
		mutation.mutate({ message: message.trim(), title: title.trim(), type });
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Broadcast Notification</DialogTitle>
					<DialogDescription>
						Send a notification to all users in the system.
					</DialogDescription>
				</DialogHeader>
				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="broadcast-title">Title</Label>
						<Input
							autoComplete="off"
							id="broadcast-title"
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. Scheduled maintenance…"
							required
							value={title}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="broadcast-message">Message</Label>
						<Textarea
							autoComplete="off"
							className="resize-y"
							id="broadcast-message"
							onChange={(e) => setMessage(e.target.value)}
							placeholder="e.g. Maintenance starts soon…"
							required
							rows={4}
							value={message}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="broadcast-type">Type</Label>
						<Select onValueChange={setType} value={type}>
							<SelectTrigger className="w-full" id="broadcast-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{BROADCAST_TYPES.map((t) => (
									<SelectItem key={t.value} value={t.value}>
										<span
											aria-hidden="true"
											className={cn('size-2 shrink-0 rounded-full', t.dot)}
										/>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<DialogFooter>
						<Button disabled={mutation.isPending} type="submit">
							{mutation.isPending ? 'Sending…' : 'Send Broadcast'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
