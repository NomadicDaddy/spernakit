import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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
		<>
			<div className="flex flex-row items-center justify-between rounded-lg border p-4">
				<div className="space-y-0.5">
					<Label htmlFor="authRateLimitEnabled">Auth Rate Limiting</Label>
					<p className="text-muted-foreground text-sm">
						Throttle login, registration, and password-reset requests by IP to slow
						brute-force attempts
					</p>
				</div>
				<Switch
					checked={authRateLimitEnabled}
					id="authRateLimitEnabled"
					onCheckedChange={onAuthRateLimitEnabledChange}
				/>
			</div>

			{authRateLimitEnabled && (
				<div className="space-y-4 rounded-lg border p-4">
					<div className="space-y-2">
						<Label htmlFor="authRateLimitMaxRequests">Max Requests per Window</Label>
						<Input
							autoComplete="off"
							id="authRateLimitMaxRequests"
							inputMode="numeric"
							max={1000}
							min={1}
							onChange={(e) => onAuthRateLimitMaxRequestsChange(e.target.value)}
							type="number"
							value={authRateLimitMaxRequests}
						/>
						<p className="text-muted-foreground text-sm">
							Maximum auth requests a single IP may issue in one window (1-1000)
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="authRateLimitWindowMinutes">Window (minutes)</Label>
						<Input
							autoComplete="off"
							id="authRateLimitWindowMinutes"
							inputMode="numeric"
							max={1440}
							min={1}
							onChange={(e) => onAuthRateLimitWindowMinutesChange(e.target.value)}
							type="number"
							value={authRateLimitWindowMinutes}
						/>
						<p className="text-muted-foreground text-sm">
							Rolling window size for the limit (1-1440 minutes)
						</p>
					</div>

					<p className="text-muted-foreground text-xs">
						Enforced by the backend auth rate limit plugin. Changes take effect on the
						next auth request.
					</p>
				</div>
			)}
		</>
	);
}

export { AuthRateLimitSection };
export type { AuthRateLimitActions, AuthRateLimitState };
