import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { SettingsNumberField } from '../SettingsNumberField';
import { SettingsToggleRow } from '../SettingsToggleRow';

/** Typed state for the auth rate limit section. */
interface AuthRateLimitState {
	authRateLimitEnabled: boolean;
	authRateLimitMaxRequests: string;
	authRateLimitWindowMinutes: string;
}

/** Typed actions for the auth rate limit section. */
interface AuthRateLimitActions {
	onAuthRateLimitEnabledChange: (checked: boolean) => void;
	onAuthRateLimitMaxRequestsChange: (value: string) => void;
	onAuthRateLimitWindowMinutesChange: (value: string) => void;
}

type AuthRateLimitSectionProps = AuthRateLimitActions & AuthRateLimitState;

function AuthRateLimitSection({
	authRateLimitEnabled,
	authRateLimitMaxRequests,
	authRateLimitWindowMinutes,
	onAuthRateLimitEnabledChange,
	onAuthRateLimitMaxRequestsChange,
	onAuthRateLimitWindowMinutesChange,
}: AuthRateLimitSectionProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Auth Rate Limiting</CardTitle>
				<CardDescription>
					Throttle login, registration and password-reset requests by IP to slow
					brute-force attempts.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<SettingsToggleRow
					checked={authRateLimitEnabled}
					id="authRateLimitEnabled"
					label="Enable auth rate limiting"
					onCheckedChange={onAuthRateLimitEnabledChange}
				/>

				{authRateLimitEnabled && (
					<>
						<div className="grid max-w-2xl gap-4 sm:grid-cols-2">
							<SettingsNumberField
								hint="Auth requests one IP may issue per window (1–1000)."
								id="authRateLimitMaxRequests"
								label="Max Requests per Window"
								max={1000}
								min={1}
								onChange={onAuthRateLimitMaxRequestsChange}
								value={authRateLimitMaxRequests}
							/>
							<SettingsNumberField
								hint="Rolling window size for the limit (1–1440 minutes)."
								id="authRateLimitWindowMinutes"
								label="Window (minutes)"
								max={1440}
								min={1}
								onChange={onAuthRateLimitWindowMinutesChange}
								value={authRateLimitWindowMinutes}
							/>
						</div>

						<p className="text-xs text-muted-foreground">
							Enforced by the backend auth rate limit plugin. Changes take effect on
							the next auth request.
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}

export { AuthRateLimitSection };
export type { AuthRateLimitActions, AuthRateLimitState };
