import { useState } from 'react';
import { toast } from 'sonner';

import { useSaveSetting, useSettings } from '@/hooks/settings/useSettingsHooks';

import { FEATURE_TOGGLES, FeatureFlagsSection } from './FeatureFlagsSection';
import { LayoutDefaultsSection } from './LayoutDefaultsSection';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBool(settingsMap: Map<string, { value?: string }>, key: string, fallback: boolean) {
	const raw = settingsMap.get(key)?.value;
	return raw !== undefined ? String(raw) === 'true' : fallback;
}

// ─── Tab Root ────────────────────────────────────────────────────────────────

function ApplicationTab() {
	const { data } = useSettings();
	const [optimisticFeatures, setOptimisticFeatures] = useState<Record<string, boolean>>({});
	const [optimisticLayout, setOptimisticLayout] = useState<'sidebar' | 'topbar' | null>(null);

	const saveSetting = useSaveSetting([['app-features']]);

	const allSettings = data?.data ?? [];
	const settingsMap = new Map(allSettings.map((s) => [s.key, s]));

	// Build features object from server state + optimistic overrides
	const features: Record<string, boolean> = {};
	for (const toggle of FEATURE_TOGGLES) {
		const serverValue = parseBool(settingsMap, toggle.settingKey, true);
		features[toggle.key] = optimisticFeatures[toggle.key] ?? serverValue;
	}

	const serverLayoutRaw = settingsMap.get('app.default_layout_mode')?.value ?? '';
	const serverDefaultLayoutMode: 'sidebar' | 'topbar' = serverLayoutRaw.includes('topbar')
		? 'topbar'
		: 'sidebar';
	const defaultLayoutMode = optimisticLayout ?? serverDefaultLayoutMode;

	function handleFeatureChange(key: string, value: boolean) {
		const toggle = FEATURE_TOGGLES.find((t) => t.key === key);
		if (!toggle) return;

		setOptimisticFeatures((prev) => ({ ...prev, [key]: value }));
		saveSetting.mutate(
			{ key: toggle.settingKey, value: JSON.stringify(value) },
			{
				onError: () => {
					setOptimisticFeatures((prev) => {
						const next = { ...prev };
						delete next[key];
						return next;
					});
					toast.error(
						`Failed to update ${toggle.label.toLowerCase()}. Please try again.`
					);
				},
				onSuccess: () => {
					setOptimisticFeatures((prev) => {
						const next = { ...prev };
						delete next[key];
						return next;
					});
					toast.success(`${toggle.label} updated`);
				},
			}
		);
	}

	function handleDefaultLayoutChange(mode: 'sidebar' | 'topbar') {
		setOptimisticLayout(mode);
		saveSetting.mutate(
			{ key: 'app.default_layout_mode', value: JSON.stringify(mode) },
			{
				onError: () => {
					setOptimisticLayout(null);
					toast.error('Failed to update default layout. Refresh the page and try again.');
				},
				onSuccess: () => {
					toast.success('Default layout updated');
					setOptimisticLayout(null);
				},
			}
		);
	}

	return (
		<div className="space-y-6">
			<FeatureFlagsSection
				features={features}
				onFeatureChange={handleFeatureChange}
				pending={saveSetting.isPending}
			/>
			<LayoutDefaultsSection
				defaultLayoutMode={defaultLayoutMode}
				onDefaultLayoutChange={handleDefaultLayoutChange}
				pending={saveSetting.isPending}
			/>
		</div>
	);
}

export { ApplicationTab };
