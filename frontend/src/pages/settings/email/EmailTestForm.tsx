import { Send } from 'lucide-react';
import { useState } from 'react';

import type { EmailStatus } from '@/api/smtp';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface TestEmailParams {
	message?: string;
	subject?: string;
	testEmail: string;
}

interface EmailTestFormProps {
	onSendTest: (params: TestEmailParams) => void;
	status: EmailStatus;
	testPending: boolean;
}

/**
 * Test email form component.
 */
export function EmailTestForm({ onSendTest, status, testPending }: EmailTestFormProps) {
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
				<CardTitle className="flex items-center gap-2">
					<Send aria-hidden="true" className="size-5" />
					Send Test Email
				</CardTitle>
				<CardDescription>
					Verify your SMTP configuration by sending a test email.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="testEmail">Recipient Email *</Label>
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
						<Label htmlFor="testSubject">Subject (optional)</Label>
						<Input
							disabled={!status.configured}
							id="testSubject"
							name="testSubject"
							onChange={(e) => setTestSubject(e.target.value)}
							placeholder="Test email"
							type="text"
							value={testSubject}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="testMessage">Message (optional)</Label>
						<Textarea
							className="resize-y"
							disabled={!status.configured}
							id="testMessage"
							name="testMessage"
							onChange={(e) => setTestMessage(e.target.value)}
							placeholder="This is a test email."
							rows={4}
							value={testMessage}
						/>
					</div>
					<Button disabled={!status.configured || testPending} type="submit">
						<Send aria-hidden="true" className="mr-2 size-4" />
						{testPending ? 'Sending…' : 'Send Test Email'}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
