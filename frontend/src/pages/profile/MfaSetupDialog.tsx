import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { getSafeErrorMessage } from '@/api/errorHandling';
import { setupMfa, verifyMfaSetup } from '@/api/mfa';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

import { CopyButton } from './CopyButton';

interface MfaSetupDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onEnabled: () => void;
}

type Step = 'backup-codes' | 'enroll' | 'password';

/**
 * Multi-step MFA enrollment flow:
 *   1. Prompt for current password (step-up re-auth).
 *   2. Call /auth/mfa/setup with the password to receive secret + qrUri.
 *   3. Render QR + manual secret. User enters a TOTP code and POSTs
 *      /auth/mfa/verify-setup to activate MFA.
 *   4. On verify success, the server returns the one-time backup codes
 *      (issued only AFTER proof-of-possession). Display them with a
 *      "I have saved these" confirmation before closing the dialog.
 */
function MfaSetupDialog(props: MfaSetupDialogProps) {
	// Remount on every open so internal state resets naturally without
	// setState-in-effect (enforced by react-hooks/set-state-in-effect).
	return props.isOpen ? <MfaSetupDialogInner key={String(props.isOpen)} {...props} /> : null;
}

function MfaSetupDialogInner({ isOpen, onClose, onEnabled }: MfaSetupDialogProps) {
	const [step, setStep] = useState<Step>('password');
	const [currentPassword, setCurrentPassword] = useState('');
	const [code, setCode] = useState('');
	const [qrDataUrl, setQrDataUrl] = useState<null | string>(null);
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [acknowledgedCodes, setAcknowledgedCodes] = useState(false);

	const setup = useMutation({
		mutationFn: (password: string) => setupMfa(password),
		onSuccess: async (data) => {
			const { default: QRCode } = await import('qrcode');
			const dataUrl = await QRCode.toDataURL(data.qrUri, {
				errorCorrectionLevel: 'M',
				margin: 1,
				type: 'image/png',
				width: 192,
			});
			setQrDataUrl(dataUrl);
			setStep('enroll');
		},
	});

	const verify = useMutation({
		mutationFn: (totpCode: string) => verifyMfaSetup(totpCode),
		onSuccess: (result) => {
			setBackupCodes(result.backupCodes);
			setStep('backup-codes');
		},
	});

	function handleClose() {
		onClose();
	}

	function handleFinish() {
		toast.success('Two-factor authentication is now enabled.');
		onEnabled();
		handleClose();
	}

	const setupError = setup.error
		? getSafeErrorMessage(setup.error, 'Failed to start MFA setup')
		: null;
	const verifyError = verify.error
		? getSafeErrorMessage(verify.error, 'Verification failed')
		: null;
	const error = verifyError ?? setupError;

	return (
		<Dialog onOpenChange={(open) => !open && handleClose()} open={isOpen}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Enable two-factor authentication</DialogTitle>
					<DialogDescription>
						{step === 'password' &&
							'Confirm your current password to begin enrolling an authenticator.'}
						{step === 'enroll' &&
							'Scan the QR code with your authenticator app, then enter a code to confirm.'}
						{step === 'backup-codes' &&
							'Save these one-time recovery codes now — they will not be shown again.'}
					</DialogDescription>
				</DialogHeader>

				{step === 'password' && (
					<div className="space-y-2">
						<Label htmlFor="mfa-setup-password">Current password</Label>
						<Input
							autoComplete="current-password"
							id="mfa-setup-password"
							onChange={(e) => setCurrentPassword(e.target.value)}
							placeholder="Enter your password"
							type="password"
							value={currentPassword}
						/>
					</div>
				)}

				{step === 'enroll' && setup.isPending && (
					<div className="flex justify-center py-8">
						<Spinner />
					</div>
				)}

				{step === 'enroll' && setup.data && (
					<div className="space-y-4">
						<div className="bg-muted flex justify-center rounded-md p-4">
							{qrDataUrl && (
								<img
									alt="MFA enrollment QR code"
									height={192}
									src={qrDataUrl}
									width={192}
								/>
							)}
						</div>

						<div className="space-y-1">
							<Label>Manual setup code</Label>
							<div className="flex items-center gap-2">
								<code
									className="bg-muted flex-1 rounded px-2 py-1 font-mono text-xs break-all"
									translate="no">
									{setup.data.secret}
								</code>
								<CopyButton value={setup.data.secret} />
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="mfa-setup-code">Verification code</Label>
							<Input
								autoComplete="one-time-code"
								id="mfa-setup-code"
								inputMode="numeric"
								maxLength={6}
								minLength={6}
								onChange={(e) => setCode(e.target.value)}
								pattern="[0-9]{6}"
								placeholder="123456"
								value={code}
							/>
						</div>
					</div>
				)}

				{step === 'backup-codes' && (
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<Label>Recovery codes</Label>
							<CopyButton value={backupCodes.join('\n')} />
						</div>
						<p className="text-muted-foreground text-xs">
							Each code can be used once if you lose access to your authenticator.
							Store them somewhere safe. They will not be shown again.
						</p>
						<div className="bg-muted rounded-md p-3">
							<div className="grid grid-cols-2 gap-1 font-mono text-xs">
								{backupCodes.map((c) => (
									<span key={c}>{c}</span>
								))}
							</div>
						</div>
						<label className="flex items-center gap-2 text-sm">
							<Checkbox
								checked={acknowledgedCodes}
								onCheckedChange={(checked) =>
									setAcknowledgedCodes(checked === true)
								}
							/>
							I have saved these recovery codes in a safe place.
						</label>
					</div>
				)}

				{error && (
					<p aria-live="polite" className="text-destructive text-sm" role="alert">
						{error}
					</p>
				)}

				<DialogFooter>
					<Button onClick={handleClose} type="button" variant="outline">
						Cancel
					</Button>
					{step === 'password' && (
						<Button
							disabled={setup.isPending || currentPassword.length === 0}
							onClick={() => setup.mutate(currentPassword)}
							type="button">
							{setup.isPending && <Spinner className="mr-2" />}
							{setup.isPending ? 'Verifying…' : 'Continue'}
						</Button>
					)}
					{step === 'enroll' && (
						<Button
							disabled={verify.isPending || setup.isPending || code.length !== 6}
							onClick={() => verify.mutate(code)}
							type="button">
							{verify.isPending && <Spinner className="mr-2" />}
							{verify.isPending ? 'Verifying…' : 'Enable MFA'}
						</Button>
					)}
					{step === 'backup-codes' && (
						<Button disabled={!acknowledgedCodes} onClick={handleFinish} type="button">
							Finish
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { MfaSetupDialog };
