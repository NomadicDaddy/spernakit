import type { UserUiSettings } from '@/api/userSettings';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

function DisplayPreferences({
	disabled,
	onChange,
	uiSettings,
}: {
	disabled: boolean;
	onChange: <K extends keyof UserUiSettings>(key: K, value: UserUiSettings[K]) => void;
	uiSettings: undefined | UserUiSettings;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Display</CardTitle>
				<CardDescription>Customize how information is displayed</CardDescription>
			</CardHeader>
			{/*
			 * One grid, seven cells, and every trigger filling its cell. The six selects used to
			 * size to their own content — 67px to 165px — so the card's right edge stepped in and
			 * out six times, and "Items per page" sat outside the grid entirely, leaving an empty
			 * 703x150px hole in the right column and putting a 67px control alone on a 1422px row.
			 */}
			<CardContent>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="density">UI density</Label>
						<Select
							disabled={disabled}
							onValueChange={(value) =>
								onChange('density', value as 'comfortable' | 'compact' | 'relaxed')
							}
							value={uiSettings?.density ?? 'comfortable'}>
							<SelectTrigger className="w-full" id="density">
								<SelectValue placeholder="Select density…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="compact">Compact</SelectItem>
								<SelectItem value="comfortable">Comfortable</SelectItem>
								<SelectItem value="relaxed">Relaxed</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="timezone">Timezone</Label>
						<Select
							disabled={disabled}
							onValueChange={(value) => onChange('timezone', value)}
							value={uiSettings?.timezone ?? ''}>
							<SelectTrigger className="w-full" id="timezone">
								<SelectValue placeholder="Select timezone…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="UTC">UTC</SelectItem>
								<SelectItem value="America/New_York">America/New_York</SelectItem>
								<SelectItem value="America/Los_Angeles">
									America/Los_Angeles
								</SelectItem>
								<SelectItem value="America/Chicago">America/Chicago</SelectItem>
								<SelectItem value="Europe/London">Europe/London</SelectItem>
								<SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
								<SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
								<SelectItem value="Australia/Sydney">Australia/Sydney</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="language">Language</Label>
						<Select
							disabled={disabled}
							onValueChange={(value) => onChange('language', value)}
							value={uiSettings?.language ?? ''}>
							<SelectTrigger className="w-full" id="language">
								<SelectValue placeholder="Select language…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="en">English</SelectItem>
								<SelectItem value="es">Español</SelectItem>
								<SelectItem value="fr">Français</SelectItem>
								<SelectItem value="de">Deutsch</SelectItem>
								<SelectItem value="ja">日本語</SelectItem>
								<SelectItem value="zh">中文</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="dateFormat">Date format</Label>
						<Select
							disabled={disabled}
							onValueChange={(value) => onChange('dateFormat', value)}
							value={uiSettings?.dateFormat ?? ''}>
							<SelectTrigger className="w-full" id="dateFormat">
								<SelectValue placeholder="Select date format…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
								<SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
								<SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="timeFormat">Time format</Label>
						<Select
							disabled={disabled}
							onValueChange={(value) => onChange('timeFormat', value)}
							value={uiSettings?.timeFormat ?? ''}>
							<SelectTrigger className="w-full" id="timeFormat">
								<SelectValue placeholder="Select time format…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="HH:mm">24-hour (14:30)</SelectItem>
								<SelectItem value="HH:mm:ss">
									24-hour with seconds (14:30:45)
								</SelectItem>
								<SelectItem value="h:mm AM/PM">12-hour (2:30 PM)</SelectItem>
								<SelectItem value="h:mm:ss AM/PM">
									12-hour with seconds (2:30:45 PM)
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="itemsPerPage">Items per page</Label>
						<Select
							disabled={disabled}
							onValueChange={(value) => onChange('itemsPerPage', Number(value))}
							value={String(uiSettings?.itemsPerPage ?? 25)}>
							<SelectTrigger className="w-full" id="itemsPerPage">
								<SelectValue placeholder="Select items per page…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="10">10</SelectItem>
								<SelectItem value="25">25</SelectItem>
								<SelectItem value="50">50</SelectItem>
								<SelectItem value="100">100</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export { DisplayPreferences };
