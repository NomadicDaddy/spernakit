import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { generateApiKey } from '@/api/apiKeys';
import {
	API_KEY_SCOPE_LABELS,
	API_KEY_SCOPES,
	type ApiKeyCreateResponse,
	type ApiKeyScope,
} from '@/api/types';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogClose,
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

import { KeySecretDisplay } from './KeySecretDisplay';

interface CreateApiKeyDialogProps {
	onClose: () => void;
	open: boolean;
	userId: number;
}

function CreateApiKeyDialog({ onClose, open, userId }: CreateApiKeyDialogProps) {
	const queryClient = useQueryClient();
	const keyNameInputRef = useRef<HTMLInputElement>(null);

	const [keyName, setKeyName] = useState('');
	const [keyNameError, setKeyNameError] = useState<null | string>(null);
	const [keyScope, setKeyScope] = useState<ApiKeyScope>('read');
	const [createdResult, setCreatedResult] = useState<ApiKeyCreateResponse | null>(null);

	const createMutation = useMutation({
		mutationFn: () => generateApiKey(userId, { keyName, scope: keyScope }),
		onError: () => toast.error('Failed to create API key. Please try again.'),
		onSuccess: (res) => {
			setCreatedResult(res.data);
			void queryClient.invalidateQueries({ queryKey: ['api-keys', userId] });
			toast.success('API key created');
		},
	});

	function handleCreate() {
		if (createMutation.isPending) return;
		if (!keyName.trim()) {
			setKeyNameError('Key name is required');
			keyNameInputRef.current?.focus();
			return;
		}
		setKeyNameError(null);
		createMutation.mutate();
	}

	function handleOpenChange(newOpen: boolean) {
		if (!newOpen) {
			setKeyName('');
			setKeyNameError(null);
			setKeyScope('read');
			setCreatedResult(null);
			onClose();
		}
	}

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{createdResult ? 'API Key Created' : 'Generate API Key'}
					</DialogTitle>
					<DialogDescription>
						{createdResult
							? 'Copy the key and secret below. They will not be shown again.'
							: 'Create a new API key for programmatic access.'}
					</DialogDescription>
				</DialogHeader>

				{createdResult ? (
					<KeySecretDisplay result={createdResult} />
				) : (
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="keyName">Key Name</Label>
							<Input
								aria-describedby={keyNameError ? 'keyName-error' : undefined}
								autoComplete="off"
								id="keyName"
								maxLength={100}
								onChange={(e) => {
									setKeyName(e.target.value);
									if (e.target.value.trim()) {
										setKeyNameError(null);
									}
								}}
								placeholder="e.g. Production API Key"
								ref={keyNameInputRef}
								required
								value={keyName}
								{...(keyNameError ? { 'aria-invalid': true } : {})}
							/>
							{keyNameError && (
								<p
									aria-live="polite"
									className="text-sm text-destructive"
									id="keyName-error">
									{keyNameError}
								</p>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor="keyScope">Scope</Label>
							<Select
								onValueChange={(v) => setKeyScope(v as ApiKeyScope)}
								value={keyScope}>
								{/*
								 * Stacked dialog fields share one right edge. `SelectTrigger`
								 * defaults to `w-fit`, so this sat at 84px directly under a 462px
								 * Input — the form's right edge stepped in by 378px between field
								 * one and field two.
								 */}
								<SelectTrigger className="w-full" id="keyScope">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={API_KEY_SCOPES.READ}>
										{API_KEY_SCOPE_LABELS[API_KEY_SCOPES.READ]}
									</SelectItem>
									<SelectItem value={API_KEY_SCOPES.WRITE}>
										{API_KEY_SCOPE_LABELS[API_KEY_SCOPES.WRITE]}
									</SelectItem>
									<SelectItem value={API_KEY_SCOPES.ADMIN}>
										{API_KEY_SCOPE_LABELS[API_KEY_SCOPES.ADMIN]}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				)}

				<DialogFooter>
					{createdResult ? (
						<Button onClick={() => handleOpenChange(false)}>Done</Button>
					) : (
						<>
							{/*
							 * A labelled way out, which every other creation dialog in the app has —
							 * AddWidgetDialog, FormInputDialog, MfaSetupDialog on the sibling
							 * Security tab, ResetPasswordDialog, CreateWorkspaceDialog. This footer
							 * held one button, so the only dismiss was the X in the corner. Not on
							 * the post-creation step, where the secret is shown once and "Cancel"
							 * would suggest it can be undone.
							 */}
							<DialogClose asChild>
								<Button variant="outline">Cancel</Button>
							</DialogClose>
							<Button disabled={createMutation.isPending} onClick={handleCreate}>
								{createMutation.isPending ? 'Creating…' : 'Generate'}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { CreateApiKeyDialog };
