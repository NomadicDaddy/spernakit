import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { OAUTH_PROVIDER_LABELS } from 'spernakit-shared';

import {
	listOAuthProviderSettings,
	testOAuthProviderConnection,
	updateOAuthProviderSetting,
	type OAuthProviderSettings,
} from '@/api/oauthProviderSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuthorization } from '@/hooks/useAuthorization';

function ProviderRow({ settings }: { settings: OAuthProviderSettings }) {
	const queryClient = useQueryClient();
	const { isSysop } = useAuthorization();
	const label = OAUTH_PROVIDER_LABELS[settings.provider] ?? settings.provider;

	const updateMutation = useMutation({
		mutationFn: (payload: {
			callbackUrlOverride?: null | string;
			clientId?: string;
			clientSecret?: string;
			enabled?: boolean;
		}) => updateOAuthProviderSetting(settings.provider, payload),
		onError: (err) => {
			toast.error('Update Failed', {
				description: err instanceof Error ? err.message : 'Failed to update settings',
			});
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['oauth-provider-settings'] });
			// Also invalidate the providers list so login page updates
			void queryClient.invalidateQueries({ queryKey: ['oauth-providers'] });
			toast.success(`${label} settings updated`);
		},
	});

	const testMutation = useMutation({
		mutationFn: () => testOAuthProviderConnection(settings.provider),
		onError: (err) => {
			toast.error(`${label} connection test failed`, {
				description: err instanceof Error ? err.message : 'Request failed',
			});
		},
		onSuccess: (response) => {
			const { error, reachable, statusCode } = response.data;
			if (reachable) {
				toast.success(`${label} reachable`, {
					description: statusCode ? `Status ${statusCode}` : undefined,
				});
			} else {
				toast.error(`${label} unreachable`, {
					description:
						error ?? (statusCode ? `Status ${statusCode}` : 'Connection failed'),
				});
			}
		},
	});

	function handleToggle(enabled: boolean) {
		updateMutation.mutate({ enabled });
	}

	function handleClientIdBlur(e: React.FocusEvent<HTMLInputElement>) {
		const value = e.target.value.trim();
		if (value !== settings.clientId) {
			updateMutation.mutate({ clientId: value });
		}
	}

	function handleClientSecretBlur(e: React.FocusEvent<HTMLInputElement>) {
		const value = e.target.value.trim();
		if (value) {
			updateMutation.mutate({ clientSecret: value });
		}
	}

	function handleCallbackUrlBlur(e: React.FocusEvent<HTMLInputElement>) {
		const value = e.target.value.trim() || null;
		if (value !== settings.callbackUrlOverride) {
			updateMutation.mutate({ callbackUrlOverride: value });
		}
	}

	const disabled = !isSysop();

	return (
		<div className="grid gap-4 rounded-lg border p-4">
			<div className="flex items-center justify-between">
				<h3 className="font-medium">{label}</h3>
				<div className="flex items-center gap-3">
					<Button
						disabled={disabled || !settings.enabled || testMutation.isPending}
						onClick={() => testMutation.mutate()}
						size="sm"
						title={
							settings.enabled
								? 'Test provider reachability'
								: 'Enable the provider to test its connection'
						}
						type="button"
						variant="outline">
						{testMutation.isPending ? 'Testing…' : 'Test Connection'}
					</Button>
					<Label htmlFor={`oauth-${settings.provider}-enabled`}>Enabled</Label>
					<Switch
						checked={settings.enabled}
						disabled={disabled}
						id={`oauth-${settings.provider}-enabled`}
						onCheckedChange={handleToggle}
					/>
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-3">
				<div className="grid gap-1.5">
					<Label htmlFor={`oauth-${settings.provider}-client-id`}>Client ID</Label>
					<Input
						defaultValue={settings.clientId}
						disabled={disabled}
						id={`oauth-${settings.provider}-client-id`}
						onBlur={handleClientIdBlur}
						placeholder="Enter client ID"
					/>
				</div>

				<div className="grid gap-1.5">
					<Label htmlFor={`oauth-${settings.provider}-client-secret`}>
						Client Secret
					</Label>
					<Input
						defaultValue=""
						disabled={disabled}
						id={`oauth-${settings.provider}-client-secret`}
						onBlur={handleClientSecretBlur}
						placeholder={
							settings.clientSecretLast4
								? `••••••••${settings.clientSecretLast4}`
								: 'Enter client secret'
						}
						type="password"
					/>
				</div>

				<div className="grid gap-1.5">
					<Label htmlFor={`oauth-${settings.provider}-callback-url`}>
						Callback URL Override
					</Label>
					<Input
						defaultValue={settings.callbackUrlOverride ?? ''}
						disabled={disabled}
						id={`oauth-${settings.provider}-callback-url`}
						onBlur={handleCallbackUrlBlur}
						placeholder="Optional"
					/>
				</div>
			</div>
		</div>
	);
}

function OAuthProvidersSection() {
	const { isSysop } = useAuthorization();
	const { data, isLoading } = useQuery({
		queryFn: () => listOAuthProviderSettings(),
		queryKey: ['oauth-provider-settings'],
	});

	if (!isSysop()) return null;

	if (isLoading) {
		return (
			<div className="space-y-4">
				<h2 className="text-lg font-semibold">OAuth / SSO Providers</h2>
				<div className="text-muted-foreground text-sm">Loading…</div>
			</div>
		);
	}

	const providers = data?.providers ?? [];

	return (
		<div className="space-y-4">
			<h2 className="text-lg font-semibold">OAuth / SSO Providers</h2>
			<p className="text-muted-foreground text-sm">
				Configure OAuth providers for single sign-on. Changes take effect immediately.
			</p>
			<div className="space-y-3">
				{providers.map((provider) => (
					<ProviderRow key={provider.provider} settings={provider} />
				))}
			</div>
		</div>
	);
}

export { OAuthProvidersSection };
