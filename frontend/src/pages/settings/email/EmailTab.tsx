import { Mail } from 'lucide-react';
import { useState } from 'react';

import { type updateSmtpConfig } from '@/api/smtp';
import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useEmailSettings } from '@/hooks/settings/useEmailSettings';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useFormatters } from '@/hooks/useFormatters';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { getFormString } from '@/lib/utils';

import { EmailConfigForm } from './EmailConfigForm';
import { EmailTestForm } from './EmailTestForm';

function EmailTab() {
	const { isSysop } = useAuthorization();
	const { formatDateTime } = useFormatters();
	const { config, configLoading, status, statusLoading, testMutation, updateMutation } =
		useEmailSettings();
	const [smtpFormDirty, setSmtpFormDirty] = useState(false);
	useUnsavedChanges(smtpFormDirty);

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

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Mail aria-hidden="true" className="size-5" />
						Email Configuration
					</CardTitle>
					<CardDescription>
						SMTP settings are stored in database and managed via this form.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						<div className="flex items-center gap-3">
							<span className="text-sm font-medium">SMTP Status:</span>
							{status.configured ? (
								<Badge variant="default">Configured</Badge>
							) : (
								<Badge variant="secondary">Not configured</Badge>
							)}
						</div>
						{status.lastTestAt && (
							<div className="flex items-center gap-3">
								<span className="text-sm font-medium">Last Test:</span>
								<Badge variant={status.lastTestSuccess ? 'default' : 'destructive'}>
									{status.lastTestSuccess ? 'Success' : 'Failed'}
								</Badge>
								<span className="text-muted-foreground text-sm">
									{formatDateTime(status.lastTestAt)}
								</span>
							</div>
						)}
						{!status.configured && (
							<p className="text-muted-foreground text-sm">
								To enable email, configure SMTP settings below.
							</p>
						)}
					</div>
				</CardContent>
			</Card>

			{isSysop() && (
				<EmailConfigForm
					config={config}
					onDirtyChange={setSmtpFormDirty}
					onSave={handleSave}
					savePending={updateMutation.isPending}
				/>
			)}

			<EmailTestForm
				onSendTest={handleSendTest}
				status={status}
				testPending={testMutation.isPending}
			/>
		</div>
	);
}

export { EmailTab };
