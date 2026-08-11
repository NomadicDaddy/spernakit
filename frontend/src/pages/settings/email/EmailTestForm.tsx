import { Send } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import type { EmailStatus } from '@/api/smtp';

import { RequiredMark } from '@/components/shared/RequiredMark';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface TestEmailParams {
	message?: string;
	subject?: string;
	testEmail: string;
}

interface EmailTestFormProps {
	/** SMTP status badges — carried here only when the config card above is not rendered. */
	headerStatus?: ReactNode;
	onSendTest: (params: TestEmailParams) => void;
	status: EmailStatus;
	testPending: boolean;
}

/**
 * Test email form component.
 */
export function EmailTestForm({
	headerStatus,
	onSendTest,
	status,
	testPending,
}: EmailTestFormProps) {
	const [testEmail, setTestEmail] = useState('');
	const [testSubject, setTestSubject] = useState('');
	const [testMessage, setTestMessage] = useState('');

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!testEmail) return;

		const params: TestEmailParams = { testEmail };
		if (testMessage) params.message = testMessage;
		if (testSubject) params.subject = testSubject;
		onSendTest(params);

		setTestEmail('');
		setTestSubject('');
		setTestMessage('');
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Send Test Email</CardTitle>
				<CardDescription>
					Verify your SMTP configuration by sending a test email.
				</CardDescription>
				{headerStatus && <CardAction>{headerStatus}</CardAction>}
			</CardHeader>
			<CardContent>
				<form className="space-y-4" onSubmit={handleSubmit}>
					{/*
					 * Every control in this card is inert until SMTP is configured, and the only
					 * statement of why used to sit ~740px higher on the page — never on screen with
					 * the fields at 1280 or below.
					 */}
					{!status.configured && (
						<p className="text-sm text-muted-foreground">
							Save an SMTP configuration above to enable test sends.
						</p>
					)}
					{/*
					 * Same two-column rhythm as the config form above: a single email address was
					 * given a 1422px input two cards below a 703px input holding the same value.
					 */}
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="testEmail">
								Recipient Email <RequiredMark />
							</Label>
							<Input
								autoComplete="email"
								disabled={!status.configured}
								id="testEmail"
								name="testEmail"
								onChange={(e) => setTestEmail(e.target.value)}
								placeholder="test@example.com"
								required
								spellCheck={false}
								type="email"
								value={testEmail}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="testSubject">Subject</Label>
							<Input
								autoComplete="off"
								disabled={!status.configured}
								id="testSubject"
								name="testSubject"
								onChange={(e) => setTestSubject(e.target.value)}
								placeholder="Test email"
								type="text"
								value={testSubject}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="testMessage">Message</Label>
						{/*
						 * `rows` is inert against the shared Textarea's `field-sizing-content
						 * min-h-16`, so `rows={4}` rendered as two lines. `min-h-24` asks for the
						 * same four lines in the utility scale the component actually respects.
						 */}
						<Textarea
							autoComplete="off"
							className="min-h-24 resize-y"
							disabled={!status.configured}
							id="testMessage"
							name="testMessage"
							onChange={(e) => setTestMessage(e.target.value)}
							placeholder="This is a test email."
							value={testMessage}
						/>
					</div>
					<Button disabled={!status.configured || testPending} type="submit">
						<Send aria-hidden="true" className="size-4" />
						{testPending ? 'Sending…' : 'Send Test Email'}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
