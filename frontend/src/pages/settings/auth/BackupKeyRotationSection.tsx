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
					`Re-encrypted ${processed} backup(s); ${failed} failed. Check server logs.`,
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
					{/*
					 * One sentence, the length of its six siblings. This description was 103px —
					 * five wrapped lines — where every other CardDescription on the surface is
					 * 20px, because it carried an operational procedure in the subtitle slot: the
					 * precondition and a doc path at muted-foreground contrast, below heading
					 * weight, above the heading's own content. The procedure moved into
					 * CardContent as body copy, where a precondition for pressing the button
					 * belongs.
					 */}
					<CardDescription>
						Re-encrypt every existing backup file under the current backup encryption
						key.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/*
					 * The config keys and the doc path wear the app's own inline-command chip —
					 * `rounded bg-muted px-1 font-mono text-xs`, the same treatment
					 * /profile/security gives `bun run generate-keys`. Bare `<code>` carries no
					 * className, so all three computed to transparent background, 0 padding and
					 * 14px: identifiers an operator has to copy exactly, rendered as prose.
					 */}
					<p className="max-w-[65ch] text-sm text-muted-foreground">
						Requires a rotation staged in configuration first: set the old key as{' '}
						<code className="rounded bg-muted px-1 font-mono text-xs" translate="no">
							security.backupEncryptionKeyPrevious
						</code>{' '}
						and the new key as{' '}
						<code className="rounded bg-muted px-1 font-mono text-xs" translate="no">
							security.backupEncryptionKey
						</code>
						, then restart the app. See{' '}
						<code className="rounded bg-muted px-1 font-mono text-xs" translate="no">
							docs/template/DEVELOPMENT.md
						</code>{' '}
						(Operations — Key Rotation) for the full procedure.
					</p>
					{/*
					 * `destructive`, matching the ConfirmAlertDialog it opens. This rewrites every
					 * backup file on disk and cannot be undone, yet the trigger carried the same
					 * neutral `outline` weight as "Test Connection" in the OAuth card above it —
					 * so the only risk signal in the whole interaction arrived after the click.
					 * /notifications and /workspaces already front their bulk-destructive actions
					 * with a destructive trigger; this one now does too.
					 */}
					<Button
						disabled={rotateBackupKeyMutation.isPending}
						onClick={() => setShowRotateConfirm(true)}
						type="button"
						variant="destructive">
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
				variant="destructive"
			/>
		</>
	);
}

export { BackupKeyRotationSection };
