import { useState } from 'react';

import { type updateSmtpConfig } from '@/api/smtp';
import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { UnsavedChangesGuard } from '@/components/shared/UnsavedChangesGuard';
import { Badge } from '@/components/ui/badge';
import { useEmailSettings } from '@/hooks/settings/useEmailSettings';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useFormatters } from '@/hooks/useFormatters';
import { getFormString } from '@/lib/utils';

import { EmailConfigForm } from './EmailConfigForm';
import { EmailTestForm } from './EmailTestForm';

function EmailTab() {
	const { isSysop } = useAuthorization();
	const { formatDateTime } = useFormatters();
	const { config, configLoading, status, statusLoading, testMutation, updateMutation } =
		useEmailSettings();
	const [smtpFormDirty, setSmtpFormDirty] = useState(false);

	function handleSave(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		const formData = new FormData(form);

		const update: Parameters<typeof updateSmtpConfig>[0] = {
			fromAddress: getFormString(formData, 'fromAddress'),
			fromName: getFormString(formData, 'fromName'),
			host: getFormString(formData, 'host'),
			password: getFormString(formData, 'password'),
			port: Number.parseInt(getFormString(formData, 'port'), 10),
			secure: formData.get('secure') === 'true',
			user: getFormString(formData, 'user'),
		};

		updateMutation.mutate(update, {
			onSuccess: () => setSmtpFormDirty(false),
		});
	}

	function handleSendTest(params: { message?: string; subject?: string; testEmail: string }) {
		testMutation.mutate(params);
	}

	if (configLoading || statusLoading) {
		return <CardSkeleton contentLines={3} descriptionWidth="h-4 w-64" />;
	}

	/*
	 * The surface used to open on a 176px card holding one badge, two sentences and no controls —
	 * a title naming the same subject as the card directly below it and a description pointing at
	 * a form that lived in that other card. Folding the state into the header of the card that
	 * changes it puts status beside its control and brings the whole surface inside one 1440x1200
	 * screen.
	 */
	const headerStatus = (
		<div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
			{/*
			 * `warning`, not `secondary`. Both halves of this expression sit in one status slot,
			 * and the sibling test chips beside them are `success`/`destructive` — so a neutral
			 * grey pill mixed an identity chip into a state vocabulary, and "Not configured" ended
			 * up looking like the role and kind tags used elsewhere in Settings. badge.tsx assigns
			 * `success`/`warning`/`destructive` to state and reserves `secondary`/`outline` for
			 * identity and metadata. `warning` also matches what the state does: it is what
			 * disables the entire card below it.
			 */}
			{status.configured ? (
				<Badge variant="success">Configured</Badge>
			) : (
				<Badge variant="warning">Not configured</Badge>
			)}
			{status.lastTestAt && (
				<>
					<Badge variant={status.lastTestSuccess ? 'success' : 'destructive'}>
						{status.lastTestSuccess ? 'Test passed' : 'Test failed'}
					</Badge>
					<span className="text-xs text-muted-foreground">
						{formatDateTime(status.lastTestAt)}
					</span>
				</>
			)}
		</div>
	);

	return (
		<div className="space-y-6">
			<UnsavedChangesGuard isDirty={smtpFormDirty} />
			{isSysop() && (
				<EmailConfigForm
					config={config}
					dirty={smtpFormDirty}
					headerStatus={headerStatus}
					onDirtyChange={setSmtpFormDirty}
					onSave={handleSave}
					savePending={updateMutation.isPending}
				/>
			)}

			<EmailTestForm
				onSendTest={handleSendTest}
				status={status}
				testPending={testMutation.isPending}
				{...(isSysop() ? {} : { headerStatus })}
			/>
		</div>
	);
}

export { EmailTab };
