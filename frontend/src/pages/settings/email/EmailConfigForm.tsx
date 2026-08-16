import type { ReactNode } from 'react';

import type { SmtpConfig } from '@/api/smtp';

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
import { Switch } from '@/components/ui/switch';

interface EmailConfigFormProps {
	config: SmtpConfig;
	dirty: boolean;
	/** SMTP status badges, hoisted here from the standalone status card this surface used to open on. */
	headerStatus?: ReactNode;
	onDirtyChange?: (dirty: boolean) => void;
	onSave: (e: React.FormEvent<HTMLFormElement>) => void;
	savePending: boolean;
}

/**
 * SMTP configuration form component.
 */
export function EmailConfigForm({
	config,
	dirty,
	headerStatus,
	onDirtyChange,
	onSave,
	savePending,
}: EmailConfigFormProps) {
	return (
		<Card>
			<CardHeader>
				{/*
				 * Plain title: of ~26 CardTitles under pages/settings only five carried an icon and
				 * three of those were this surface's. The icon slot belongs to PageHeader.
				 */}
				<CardTitle>SMTP Configuration</CardTitle>
				<CardDescription>
					Configure your SMTP server for sending emails. All changes are logged.
				</CardDescription>
				{headerStatus && <CardAction>{headerStatus}</CardAction>}
			</CardHeader>
			<CardContent>
				{/* `max-w-2xl` on the form, the stack cap the authentication sections use: the three
				    field grids and the SSL/TLS row between them share one right edge, and the row
				    stops running to the full card width while the fields around it do not. */}
				<form
					className="max-w-2xl space-y-4"
					onInput={() => onDirtyChange?.(true)}
					onSubmit={onSave}>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="host">
								SMTP Host <RequiredMark />
							</Label>
							<Input
								autoComplete="off"
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
							<Label htmlFor="port">
								SMTP Port <RequiredMark />
							</Label>
							<Input
								autoComplete="off"
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

					{/*
					 * The same bordered whole-row `<label>` SettingsToggleRow renders, down to the
					 * classes — this row used to invert the pattern with the switch first and the
					 * label trailing it, floating unaligned between two field grids, and then sat
					 * borderless while every other toggle in settings gained an edge.
					 *
					 * The row cannot use SettingsToggleRow itself: that component is controlled and
					 * this form reads its values back through FormData. `onCheckedChange` marks the
					 * form dirty because Radix's Switch does not emit a bubbling `input` event. The
					 * markup is duplicated rather than the component being made to serve both, which
					 * is one uncontrolled caller's worth of duplication against an uncontrolled mode
					 * on every caller.
					 */}
					<label
						className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3"
						htmlFor="secure">
						<span className="space-y-0.5">
							<span className="block text-sm font-medium">Use SSL/TLS</span>
							<span className="block text-xs text-muted-foreground">
								Connect over an implicit TLS port, typically 465.
							</span>
						</span>
						<Switch
							defaultChecked={config.secure}
							id="secure"
							name="secure"
							onCheckedChange={() => onDirtyChange?.(true)}
							value="true"
						/>
					</label>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="user">
								SMTP Username <RequiredMark />
							</Label>
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
							<Label htmlFor="password">
								SMTP Password <RequiredMark />
							</Label>
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
							<Label htmlFor="fromAddress">
								From Email Address <RequiredMark />
							</Label>
							<Input
								autoComplete="off"
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
								autoComplete="off"
								defaultValue={config.fromName}
								id="fromName"
								name="fromName"
								placeholder="My Application"
								type="text"
							/>
						</div>
					</div>

					{/*
					 * Disabled until something changes, matching /settings/authentication. A
					 * saturated primary button on a pristine form with six empty required fields
					 * invites a submit that can only fail.
					 */}
					<Button disabled={!dirty || savePending} type="submit">
						{savePending ? 'Saving…' : 'Save Configuration'}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
