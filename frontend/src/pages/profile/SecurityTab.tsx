import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { getSafeErrorMessage } from '@/api/errorHandling';
import {
	disableMfa,
	getMfaStatus,
	regenerateRecoveryCodes,
	type RecoveryCodesResult,
} from '@/api/mfa';
import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { CopyButton } from './CopyButton';
import { MfaSetupDialog } from './MfaSetupDialog';

const MFA_STATUS_KEY = ['auth', 'mfa', 'status'] as const;

function SecurityTab() {
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery({
		queryFn: getMfaStatus,
		queryKey: MFA_STATUS_KEY,
	});

	const [setupOpen, setSetupOpen] = useState(false);
	const [disableCode, setDisableCode] = useState('');
	const [disabling, setDisabling] = useState(false);
	const [regenCode, setRegenCode] = useState('');
	const [regenerating, setRegenerating] = useState(false);
	const [newRecoveryCodes, setNewRecoveryCodes] = useState<null | RecoveryCodesResult>(null);

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: MFA_STATUS_KEY });
	};

	const handleDisable = async () => {
		setDisabling(true);
		try {
			await disableMfa(disableCode);
			toast.success('Two-factor authentication disabled.');
			setDisableCode('');
			setNewRecoveryCodes(null);
			refresh();
		} catch (err) {
			toast.error(getSafeErrorMessage(err, 'Failed to disable MFA'));
		} finally {
			setDisabling(false);
		}
	};

	const handleRegenerate = async () => {
		setRegenerating(true);
		try {
			const result = await regenerateRecoveryCodes(regenCode);
			setNewRecoveryCodes(result);
			setRegenCode('');
			toast.success('New recovery codes generated. Save them now.');
		} catch (err) {
			toast.error(getSafeErrorMessage(err, 'Failed to regenerate recovery codes'));
		} finally {
			setRegenerating(false);
		}
	};

	if (isLoading) {
		return <CardSkeleton contentLines={3} descriptionWidth="h-4 w-64" titleWidth="h-6 w-48" />;
	}

	const enabled = data?.isEnabled ?? false;
	const serverConfigured = data?.serverConfigured ?? false;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Two-factor authentication</CardTitle>
					<CardDescription>
						{enabled
							? 'MFA is active. Sign-in requires a code from your authenticator app after your password.'
							: 'Add an extra layer of security by requiring a one-time code from an authenticator app at sign-in.'}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					<p className="text-sm">
						Status:{' '}
						<span className="font-medium">{enabled ? 'Enabled' : 'Disabled'}</span>
					</p>
					{!serverConfigured && (
						<p className="text-muted-foreground text-xs">
							MFA is not configured on this server yet. Run{' '}
							<code
								className="bg-muted rounded px-1 font-mono text-xs"
								translate="no">
								bun run generate-keys
							</code>{' '}
							to provision the MFA signing key.
						</p>
					)}
				</CardContent>
				{!enabled && (
					<CardFooter>
						<Button
							disabled={!serverConfigured}
							onClick={() => setSetupOpen(true)}
							type="button">
							Enable MFA
						</Button>
					</CardFooter>
				)}
			</Card>

			{enabled && (
				<Card>
					<CardHeader>
						<CardTitle>Disable MFA</CardTitle>
						<CardDescription>
							Enter a code from your authenticator app to confirm. After disabling,
							you can sign in with just your password.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex max-w-xs items-end gap-2">
							<div className="flex-1 space-y-1">
								<Label htmlFor="disable-mfa-code">Authenticator code</Label>
								<Input
									autoComplete="one-time-code"
									id="disable-mfa-code"
									inputMode="numeric"
									maxLength={6}
									minLength={6}
									onChange={(e) => setDisableCode(e.target.value)}
									pattern="[0-9]{6}"
									placeholder="123456"
									value={disableCode}
								/>
							</div>
							<Button
								disabled={disableCode.length !== 6 || disabling}
								onClick={() => void handleDisable()}
								type="button"
								variant="destructive">
								{disabling && <Spinner className="mr-2" />}
								Disable
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{enabled && (
				<Card>
					<CardHeader>
						<CardTitle>Recovery codes</CardTitle>
						<CardDescription>
							Generate a fresh set of one-time recovery codes. The previous set is
							invalidated immediately.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex max-w-xs items-end gap-2">
							<div className="flex-1 space-y-1">
								<Label htmlFor="regen-mfa-code">Authenticator code</Label>
								<Input
									autoComplete="one-time-code"
									id="regen-mfa-code"
									inputMode="numeric"
									maxLength={6}
									minLength={6}
									onChange={(e) => setRegenCode(e.target.value)}
									pattern="[0-9]{6}"
									placeholder="123456"
									value={regenCode}
								/>
							</div>
							<Button
								disabled={regenCode.length !== 6 || regenerating}
								onClick={() => void handleRegenerate()}
								type="button">
								{regenerating && <Spinner className="mr-2" />}
								Regenerate
							</Button>
						</div>
						{newRecoveryCodes && (
							<div className="space-y-1">
								<div className="flex items-center justify-between">
									<Label>New recovery codes</Label>
									<CopyButton value={newRecoveryCodes.backupCodes.join('\n')} />
								</div>
								<p className="text-muted-foreground text-xs">
									Save these now — they will not be shown again.
								</p>
								<div className="bg-muted rounded-md p-3">
									<div className="grid grid-cols-2 gap-1 font-mono text-xs">
										{newRecoveryCodes.backupCodes.map((c) => (
											<span key={c}>{c}</span>
										))}
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			<MfaSetupDialog
				isOpen={setupOpen}
				onClose={() => setSetupOpen(false)}
				onEnabled={refresh}
			/>
		</div>
	);
}

export { SecurityTab };
