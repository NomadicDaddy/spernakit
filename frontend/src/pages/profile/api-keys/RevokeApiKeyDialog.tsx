import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { ApiKey } from '@/api/types';

import { revokeApiKey } from '@/api/apiKeys';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';

interface RevokeApiKeyDialogProps {
	onClose: () => void;
	target: ApiKey | null;
	userId: number;
}

function RevokeApiKeyDialog({ onClose, target, userId }: RevokeApiKeyDialogProps) {
	const queryClient = useQueryClient();

	const revokeMutation = useMutation({
		mutationFn: (keyId: number) => revokeApiKey(userId, keyId),
		onError: () => toast.error('Failed to revoke API key. Please try again.'),
		onSuccess: () => {
			onClose();
			void queryClient.invalidateQueries({ queryKey: ['api-keys', userId] });
			toast.success('API key revoked');
		},
	});

	return (
		<ConfirmAlertDialog
			confirmText="Revoke"
			description={
				<>
					Are you sure you want to revoke &ldquo;{target?.keyName}&rdquo;? This action
					cannot be undone.
				</>
			}
			isOpen={!!target}
			isPending={revokeMutation.isPending}
			onConfirm={() => target && revokeMutation.mutate(target.id)}
			onOpenChange={(open) => !open && onClose()}
			title="Revoke API Key"
		/>
	);
}

export { RevokeApiKeyDialog };
