import { useState } from 'react';
import { toast } from 'sonner';

import type { SuperTheme } from '@/lib/superThemes';

import { useSaveSetting, useSettings } from '@/hooks/settings/useSettingsHooks';

import { FEATURE_TOGGLES, FeatureFlagsSection } from './FeatureFlagsSection';
import { LayoutDefaultsSection } from './LayoutDefaultsSection';
import { SuperThemeSection } from './SuperThemeSection';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBool(settingsMap: Map<string, { value?: string }>, key: string, fallback: boolean) {
	const raw = settingsMap.get(key)?.value;
	return raw !== undefined ? String(raw) === 'true' : fallback;
}

function parseString(settingsMap: Map<string, { value?: string }>, key: string, fallback: string) {
	const raw = settingsMap.get(key)?.value;
	if (!raw) return fallback;
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === 'string' ? parsed : fallback;
	} catch {
		return fallback;
	}
}

// ─── Tab Root ────────────────────────────────────────────────────────────────

function ApplicationTab() {
	const { data } = useSettings();
	const [optimisticFeatures, setOptimisticFeatures] = useState<Record<string, boolean>>({});
	const [optimisticLayout, setOptimisticLayout] = useState<'sidebar' | 'topbar' | null>(null);
	const [optimisticSuperTheme, setOptimisticSuperTheme] = useState<null | SuperTheme>(null);

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

	const serverSuperTheme = parseString(settingsMap, 'app.super_theme', 'default') as SuperTheme;
	const superTheme = optimisticSuperTheme ?? serverSuperTheme;

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

	function handleSuperThemeChange(theme: SuperTheme) {
		setOptimisticSuperTheme(theme);
		saveSetting.mutate(
			{ key: 'app.super_theme', value: JSON.stringify(theme) },
			{
				onError: () => {
					setOptimisticSuperTheme(null);
					toast.error('Failed to update super-theme. Refresh the page and try again.');
				},
				onSuccess: () => {
					toast.success('Super-theme updated');
					setOptimisticSuperTheme(null);
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
			<SuperThemeSection
				onSuperThemeChange={handleSuperThemeChange}
				pending={saveSetting.isPending}
				superTheme={superTheme}
			/>
		</div>
	);
}

export { ApplicationTab };
