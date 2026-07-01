import { toast } from 'sonner';

import type { HealthCheckConfig } from '@/api/health';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

interface HealthConfigSectionProps {
	config: HealthCheckConfig | undefined;
	configLoading: boolean;
	updateConfigMutation: {
		isPending: boolean;
		mutate: (updates: Partial<HealthCheckConfig>) => void;
	};
}

type ThresholdKey =
	| 'diskSpaceDegradedThreshold'
	| 'diskSpaceUnhealthyThreshold'
	| 'memoryHeapDegradedThreshold'
	| 'memoryHeapUnhealthyThreshold';

const memoryThresholdFields = [
	{
		description: 'Heap usage percentage above which memory is marked degraded',
		id: 'memoryDegraded',
		key: 'memoryHeapDegradedThreshold' as const,
		label: 'Memory Degraded Threshold (%)',
	},
	{
		description: 'Heap usage percentage above which memory is marked unhealthy',
		id: 'memoryUnhealthy',
		key: 'memoryHeapUnhealthyThreshold' as const,
		label: 'Memory Unhealthy Threshold (%)',
	},
] as const;

const diskThresholdFields = [
	{
		description: 'Free disk space percentage below which disk is marked degraded',
		id: 'diskDegraded',
		key: 'diskSpaceDegradedThreshold' as const,
		label: 'Disk Free-Space Degraded Threshold (%)',
	},
	{
		description: 'Free disk space percentage below which disk is marked unhealthy',
		id: 'diskUnhealthy',
		key: 'diskSpaceUnhealthyThreshold' as const,
		label: 'Disk Free-Space Unhealthy Threshold (%)',
	},
] as const;

const enabledChecks = [
	{ key: 'database', label: 'Database' },
	{ key: 'disk', label: 'Disk' },
	{ key: 'memory', label: 'Memory' },
	{ key: 'filesystem', label: 'Filesystem' },
] as const;

/**
 * Validate threshold cross-constraints, mirroring the backend rules so the
 * operator gets immediate, clear feedback before an optimistic update is sent.
 * Memory thresholds rise with severity (degraded < unhealthy); disk free-space
 * thresholds are inverted (degraded > unhealthy).
 */
function validateThresholdCrossing(config: HealthCheckConfig): null | string {
	if (config.memoryHeapDegradedThreshold >= config.memoryHeapUnhealthyThreshold) {
		return 'Memory degraded threshold must be less than the unhealthy threshold.';
	}
	if (config.diskSpaceDegradedThreshold <= config.diskSpaceUnhealthyThreshold) {
		return 'Disk free-space degraded threshold must be greater than the unhealthy threshold (free-space thresholds are inverted).';
	}
	return null;
}

export function HealthConfigSection({
	config,
	configLoading,
	updateConfigMutation,
}: HealthConfigSectionProps) {
	const { isPending, mutate } = updateConfigMutation;

	function handleThresholdChange(key: ThresholdKey, raw: string) {
		if (!config) return;
		const percent = Number.parseInt(raw, 10);
		if (Number.isNaN(percent) || percent < 0 || percent > 100) return;

		const value = percent / 100;
		const next: HealthCheckConfig = { ...config, [key]: value };
		const error = validateThresholdCrossing(next);
		if (error) {
			toast.error(error);
			return;
		}
		void mutate({ [key]: value });
	}

	function handleToggle(key: string, checked: boolean) {
		void mutate({ enabled: { ...config?.enabled, [key]: checked } });
	}

	function toPercent(value: number | undefined) {
		return typeof value === 'number' ? Math.round(value * 100) : '';
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Health Check Configuration</CardTitle>
				<CardDescription>
					Configure health check thresholds, alerting, enable/disable checks, and set log
					retention. Changes require the SYSOP role.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{configLoading ? (
					<Skeleton className="h-32 w-full" />
				) : (
					<>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="alertsEnabled">Alerting</Label>
								<div className="flex items-center gap-2">
									<Switch
										checked={config?.alertsEnabled ?? true}
										disabled={isPending}
										id="alertsEnabled"
										onCheckedChange={(checked) =>
											void mutate({ alertsEnabled: checked })
										}
									/>
									<Label className="text-sm font-normal" htmlFor="alertsEnabled">
										Generate alerts on health degradation
									</Label>
								</div>
								<p className="text-muted-foreground text-xs">
									When disabled, health checks still run but no alerts are raised
								</p>
							</div>
							<div className="space-y-2">
								<Label htmlFor="alertThreshold">Alert Threshold</Label>
								<Select
									disabled={isPending}
									onValueChange={(value) =>
										void mutate({
											alertThreshold:
												value as HealthCheckConfig['alertThreshold'],
										})
									}
									value={config?.alertThreshold ?? 'degraded'}>
									<SelectTrigger id="alertThreshold">
										<SelectValue placeholder="Select threshold" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="degraded">Degraded</SelectItem>
										<SelectItem value="unhealthy">Unhealthy</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-muted-foreground text-xs">
									Minimum severity that triggers an alert
								</p>
							</div>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							{[...memoryThresholdFields, ...diskThresholdFields].map((field) => (
								<div className="space-y-2" key={field.id}>
									<Label htmlFor={field.id}>{field.label}</Label>
									<Input
										autoComplete="off"
										disabled={isPending}
										id={field.id}
										max="100"
										min="0"
										onChange={(e) =>
											handleThresholdChange(field.key, e.target.value)
										}
										step="1"
										type="number"
										value={toPercent(config?.[field.key])}
									/>
									<p className="text-muted-foreground text-xs">
										{field.description}
									</p>
								</div>
							))}
						</div>
						<div className="space-y-2">
							<Label htmlFor="logRetention">Log Retention (Days)</Label>
							<Input
								autoComplete="off"
								disabled={isPending}
								id="logRetention"
								min="1"
								onChange={(e) => {
									const value = Number.parseInt(e.target.value, 10);
									if (value >= 1) {
										void mutate({ logRetentionDays: value });
									}
								}}
								step="1"
								type="number"
								value={config?.logRetentionDays ?? 30}
							/>
							<p className="text-muted-foreground text-xs">
								Health check logs older than this will be automatically cleaned up
							</p>
						</div>
						<div className="space-y-3">
							<Label>Enabled Checks</Label>
							<div className="grid gap-2 sm:grid-cols-3">
								{enabledChecks.map((check) => (
									<div className="flex items-center gap-2" key={check.key}>
										<Switch
											checked={config?.enabled?.[check.key] ?? true}
											disabled={isPending}
											id={`check-${check.key}`}
											onCheckedChange={(checked) =>
												handleToggle(check.key, checked)
											}
										/>
										<Label className="text-sm" htmlFor={`check-${check.key}`}>
											{check.label}
										</Label>
									</div>
								))}
							</div>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
