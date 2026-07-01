import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { rotateBackupEncryptionKey } from '@/api/authSecurity';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function BackupKeyRotationSection() {
	const [showRotateConfirm, setShowRotateConfirm] = useState(false);

	const rotateBackupKeyMutation = useMutation({
		mutationFn: rotateBackupEncryptionKey,
		onError: (err: Error) => {
			toast.error(err.message || 'Failed to re-encrypt backups', {
				description:
					'Verify the backup encryption key configuration in your config file and review server logs for details.',
			});
		},
		onSuccess: (response) => {
			const { failed, processed } = response.data;
			if (failed > 0) {
				toast.warning(
					`Re-encrypted ${processed} backup(s); ${failed} failed. Check server logs.`
				);
			} else {
				toast.success(`Re-encrypted ${processed} backup(s) under the current key.`);
			}
		},
	});

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Backup Encryption Key Rotation</CardTitle>
					<CardDescription>
						Re-encrypt every existing backup file under the current backup encryption
						key. Requires that a rotation has been staged in configuration — the
						operator must set the old key as{' '}
						<code translate="no">security.backupEncryptionKeyPrevious</code> and the new
						key as <code translate="no">security.backupEncryptionKey</code>, then
						restart the app, before clicking this button. See{' '}
						<code translate="no">docs/template/DEVELOPMENT.md</code> (Operations — Key
						Rotation) for the full procedure.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						disabled={rotateBackupKeyMutation.isPending}
						onClick={() => setShowRotateConfirm(true)}
						type="button"
						variant="outline">
						{rotateBackupKeyMutation.isPending
							? 'Re-encrypting backups…'
							: 'Re-encrypt backups under current key'}
					</Button>
				</CardContent>
			</Card>
			<ConfirmAlertDialog
				confirmText="Re-encrypt"
				description="This will re-encrypt all backup files under the current encryption key. Ensure you have a valid backup before proceeding."
				isOpen={showRotateConfirm}
				isPending={rotateBackupKeyMutation.isPending}
				onConfirm={() => {
					rotateBackupKeyMutation.mutate();
					setShowRotateConfirm(false);
				}}
				onOpenChange={setShowRotateConfirm}
				title="Re-encrypt All Backups"
			/>
		</>
	);
}

export { BackupKeyRotationSection };
