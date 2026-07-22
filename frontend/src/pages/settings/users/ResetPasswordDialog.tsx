import { useState } from 'react';
import { toast } from 'sonner';

import type { User } from '@/api/types';

import { adminResetPassword } from '@/api/users';
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
import { useAuthStore } from '@/stores/authStore';

interface ResetPasswordDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	user: null | User;
}

type ResetMode = 'email' | 'set';

function ResetPasswordDialog({ isOpen, onOpenChange, user }: ResetPasswordDialogProps) {
	const [mode, setMode] = useState<ResetMode>('set');
	const [password, setPassword] = useState('');
	const [isPending, setIsPending] = useState(false);
	const currentUser = useAuthStore((s) => s.user);

	const isSelfReset = user !== null && currentUser?.id === user.id;

	async function handleConfirm() {
		if (!user) return;

		setIsPending(true);
		try {
			const payload =
				mode === 'set' ? { mode: 'set' as const, password } : { mode: 'email' as const };

			await adminResetPassword(user.id, payload);

			if (isSelfReset) {
				toast.success('Password updated. Your current session remains active.');
			} else if (mode === 'email') {
				toast.success(`Reset email sent to ${user.email}`);
			} else {
				toast.success(`Password reset for ${user.username}`);
			}

			handleClose();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to reset password';
			toast.error('Reset Failed', { description: message });
		} finally {
			setIsPending(false);
		}
	}

	function handleClose() {
		setMode('set');
		setPassword('');
		onOpenChange(false);
	}

	function handleModeChange(value: string) {
		setMode(value as ResetMode);
		setPassword('');
	}

	return (
		<Dialog onOpenChange={handleClose} open={isOpen}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Reset Password</DialogTitle>
					<DialogDescription>
						{isSelfReset
							? 'Reset your own password. Your current session will remain active after the reset.'
							: `Reset the password for ${user?.username}. The user will be required to change their password on next login.`}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="reset-mode">Reset Mode</Label>
						<Select onValueChange={handleModeChange} value={mode}>
							<SelectTrigger id="reset-mode">
								<SelectValue placeholder="Select mode" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="set">Set new password</SelectItem>
								<SelectItem value="email">Send reset email</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{mode === 'set' && (
						<div className="grid gap-2">
							<Label htmlFor="new-password">New Password</Label>
							<Input
								autoComplete="new-password"
								id="new-password"
								onChange={(e) => setPassword(e.target.value)}
								placeholder="Enter new password"
								type="password"
								value={password}
							/>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						disabled={isPending}
						onClick={handleClose}
						type="button"
						variant="outline">
						Cancel
					</Button>
					<Button
						disabled={isPending || (mode === 'set' && !password.trim())}
						onClick={() => void handleConfirm()}
						type="button">
						{isPending ? 'Resetting…' : 'Reset Password'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { ResetPasswordDialog };
