import { Shield } from 'lucide-react';

import type { SmtpConfig } from '@/api/smtp';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface EmailConfigFormProps {
	config: SmtpConfig;
	onDirtyChange?: (dirty: boolean) => void;
	onSave: (e: React.FormEvent<HTMLFormElement>) => void;
	savePending: boolean;
}

/**
 * SMTP configuration form component.
 */
export function EmailConfigForm({
	config,
	onDirtyChange,
	onSave,
	savePending,
}: EmailConfigFormProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Shield aria-hidden="true" className="size-5" />
					SMTP Configuration
				</CardTitle>
				<CardDescription>
					Configure your SMTP server for sending emails. All changes are logged.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-4" onInput={() => onDirtyChange?.(true)} onSubmit={onSave}>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="host">SMTP Host *</Label>
							<Input
								defaultValue={config.host}
								id="host"
								name="host"
								placeholder="smtp.example.com"
								required
								spellCheck={false}
								type="text"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="port">SMTP Port *</Label>
							<Input
								defaultValue={config.port}
								id="port"
								inputMode="numeric"
								max={65535}
								min={1}
								name="port"
								placeholder="Port"
								required
								type="number"
							/>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<Switch
							defaultChecked={config.secure}
							id="secure"
							name="secure"
							value="true"
						/>
						<Label className="cursor-pointer" htmlFor="secure">
							Use SSL/TLS
						</Label>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="user">SMTP Username *</Label>
							<Input
								autoComplete="off"
								defaultValue={config.user}
								id="user"
								name="user"
								placeholder="user@example.com"
								required
								spellCheck={false}
								type="text"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">SMTP Password *</Label>
							<Input
								autoComplete="off"
								defaultValue={config.password}
								id="password"
								name="password"
								placeholder="Enter password"
								required
								type="password"
							/>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="fromAddress">From Email Address *</Label>
							<Input
								defaultValue={config.fromAddress}
								id="fromAddress"
								name="fromAddress"
								placeholder="noreply@example.com"
								required
								spellCheck={false}
								type="email"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="fromName">From Name</Label>
							<Input
								defaultValue={config.fromName}
								id="fromName"
								name="fromName"
								placeholder="My Application"
								type="text"
							/>
						</div>
					</div>

					<Button disabled={savePending} type="submit">
						{savePending ? 'Saving…' : 'Save Configuration'}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
