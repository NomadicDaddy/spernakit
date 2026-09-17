import { ShieldAlert } from 'lucide-react';

import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

import { SettingsNumberField } from '../SettingsNumberField';
import { SettingsToggleRow } from '../SettingsToggleRow';

/** Typed state for the auth rate limit section. */
interface AuthRateLimitState {
	authRateLimitEnabled: boolean;
	/**
	 * Whether the deployment's config leaves auth limiting available, straight from the server.
	 *
	 * Not part of the form. The switch beside it is editable and may hold unsaved local state,
	 * while this is set before boot and can only be changed by editing config and restarting.
	 */
	authRateLimitEnabledInConfig: boolean;
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

/**
 * Says what the two switches add up to, in the words the reader needs.
 *
 * @param enabled - The editable setting, including any unsaved change.
 * @param enabledInConfig - The pre-boot kill-switch.
 * @returns The line shown under the toggle.
 */
function describeState(enabled: boolean, enabledInConfig: boolean): string {
	if (!enabled) return 'Auth requests are unthrottled, however many one IP sends.';
	if (!enabledInConfig) {
		return 'This switch has no effect: rateLimit.authEnabled is false in the deployment config, so auth requests are unthrottled until that is changed and the app restarted.';
	}
	return 'Repeated auth requests from one IP are throttled.';
}

function AuthRateLimitSection({
	authRateLimitEnabled,
	authRateLimitEnabledInConfig,
	authRateLimitMaxRequests,
	authRateLimitWindowMinutes,
	onAuthRateLimitEnabledChange,
	onAuthRateLimitMaxRequestsChange,
	onAuthRateLimitWindowMinutesChange,
}: AuthRateLimitSectionProps) {
	// Both switches have to agree before anything is throttled, which is the same rule the
	// backend plugin applies. Reading only the editable one told administrators their auth
	// endpoints were protected while every request went through, and the Runtime Config page
	// next door said the opposite.
	const inEffect = authRateLimitEnabled && authRateLimitEnabledInConfig;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Auth Rate Limiting</CardTitle>
				<CardDescription>
					Throttle login, registration and password-reset requests by IP to slow
					brute-force attempts.
				</CardDescription>
				{/* SecurityHealthSection's own risk marker, on the card whose off state is the
				    risk. See AccountLockoutSection for the reasoning. */}
				{!inEffect && (
					<CardAction>
						<ShieldAlert
							aria-label={
								authRateLimitEnabled
									? 'Auth rate limiting is switched on but disabled in config'
									: 'Auth rate limiting is off'
							}
							className="size-5 text-warning"
						/>
					</CardAction>
				)}
			</CardHeader>
			{/* `max-w-2xl` on the stack rather than on the field grid, so the toggle and the fields it
			    gates share one right edge. See SettingsToggleRow. */}
			<CardContent className="max-w-2xl space-y-4">
				{/* The gating switch gets the two-line rhythm its non-gating siblings have, so it
				    stops reading as a peer of the fields it governs. */}
				<SettingsToggleRow
					checked={authRateLimitEnabled}
					description={describeState(authRateLimitEnabled, authRateLimitEnabledInConfig)}
					id="authRateLimitEnabled"
					label="Enable auth rate limiting"
					onCheckedChange={onAuthRateLimitEnabledChange}
				/>

				{authRateLimitEnabled && (
					<>
						<div className="grid gap-4 sm:grid-cols-2">
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
							the next auth request, as long as rateLimit.authEnabled is true in the
							deployment config.
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}

export { AuthRateLimitSection };
export type { AuthRateLimitActions, AuthRateLimitState };
