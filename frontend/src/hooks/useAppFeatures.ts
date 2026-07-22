import type { AppFeaturesDefaults } from 'spernakit-shared';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getAppFeatures } from '@/api/appFeatures';

/**
 * Fetches app-wide feature flags from the settings-backed /settings/app/features endpoint.
 *
 * Returns `undefined` for `features` while loading or on error — callers must wait for
 * `isAvailable` before consuming feature flags. The shared `APP_FEATURES_DEFAULTS` is
 * NOT used as a runtime fallback; the settings table is the single source of truth.
 *
 * `placeholderData: keepPreviousData` ensures that `isSuccess` stays true during
 * background refetches (e.g. after a settings change or re-auth), which prevents
 * AppShell from returning null and flashing a blank page.
 */
function useAppFeatures() {
	const query = useQuery({
		placeholderData: keepPreviousData,
		queryFn: getAppFeatures,
		queryKey: ['app-features'],
		throwOnError: false,
	});

	const features: AppFeaturesDefaults | undefined = query.data?.data;
	const isAvailable = query.isSuccess && features !== undefined;

	return {
		features,
		isAvailable,
	};
}

export { useAppFeatures };
