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
							placeholder="Notification title"
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
							placeholder="Notification message"
							required
							rows={4}
							value={message}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="broadcast-type">Type</Label>
						<Select onValueChange={setType} value={type}>
							<SelectTrigger id="broadcast-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="info">Info</SelectItem>
								<SelectItem value="warning">Warning</SelectItem>
								<SelectItem value="error">Error</SelectItem>
								<SelectItem value="success">Success</SelectItem>
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
