import type { Dispatch, SetStateAction } from 'react';

import { Save } from 'lucide-react';

import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

const TIMEZONES = [
	'UTC',
	'America/New_York',
	'America/Chicago',
	'America/Denver',
	'America/Los_Angeles',
	'America/Anchorage',
	'Pacific/Honolulu',
	'Europe/London',
	'Europe/Paris',
	'Europe/Berlin',
	'Europe/Amsterdam',
	'Asia/Tokyo',
	'Asia/Shanghai',
	'Asia/Kolkata',
	'Australia/Sydney',
	'Pacific/Auckland',
] as const;

const CURRENCIES = [
	{ label: 'USD ($)', value: 'USD' },
	{ label: 'EUR (€)', value: 'EUR' },
	{ label: 'GBP (£)', value: 'GBP' },
	{ label: 'JPY (¥)', value: 'JPY' },
	{ label: 'CAD (C$)', value: 'CAD' },
	{ label: 'AUD (A$)', value: 'AUD' },
	{ label: 'CHF (Fr)', value: 'CHF' },
	{ label: 'CNY (¥)', value: 'CNY' },
	{ label: 'INR (₹)', value: 'INR' },
] as const;

interface GeneralFormData {
	currency: string;
	timezone: string;
}

interface WorkspaceGeneralTabProps {
	form: GeneralFormData;
	isPending: boolean;
	onSave: () => void;
	setForm: Dispatch<SetStateAction<GeneralFormData>>;
}

function WorkspaceGeneralTab({ form, isPending, onSave, setForm }: WorkspaceGeneralTabProps) {
	return (
		<div className="max-w-lg space-y-4">
			<div className="space-y-2">
				<Label htmlFor="ws-settings-timezone">Timezone</Label>
				<Select
					onValueChange={(val) =>
						setForm((prev) => ({
							...prev,
							timezone: val === '__none__' ? '' : val,
						}))
					}
					value={form.timezone || '__none__'}>
					<SelectTrigger id="ws-settings-timezone">
						<SelectValue placeholder="Select timezone" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__none__">None</SelectItem>
						{TIMEZONES.map((tz) => (
							<SelectItem key={tz} value={tz}>
								{tz}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-muted-foreground text-xs">
					Default timezone for this workspace.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="ws-settings-currency">Currency</Label>
				<Select
					onValueChange={(val) =>
						setForm((prev) => ({
							...prev,
							currency: val === '__none__' ? '' : val,
						}))
					}
					value={form.currency || '__none__'}>
					<SelectTrigger id="ws-settings-currency">
						<SelectValue placeholder="Select currency" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__none__">None</SelectItem>
						{CURRENCIES.map((c) => (
							<SelectItem key={c.value} value={c.value}>
								{c.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-muted-foreground text-xs">
					Default currency for this workspace.
				</p>
			</div>

			<Button disabled={isPending} onClick={onSave}>
				{isPending ? (
					<Spinner className="mr-2" size={16} />
				) : (
					<Save className="mr-2 h-4 w-4" />
				)}
				Save General
			</Button>
		</div>
	);
}

export { WorkspaceGeneralTab };
export type { GeneralFormData };
