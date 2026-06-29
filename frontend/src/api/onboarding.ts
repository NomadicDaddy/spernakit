import type { DataResponse } from './types';

import { apiClient } from './client';

interface OnboardingStep {
	completed: boolean;
	description: string;
	id: string;
	link: string;
	title: string;
}

interface OnboardingStatus {
	completedAt: null | string;
	completedBy: null | number;
	isComplete: boolean;
	steps: OnboardingStep[];
}

const onboardingKeys = {
	all: ['onboarding'] as const,
	status: () => [...onboardingKeys.all, 'status'] as const,
};

function getOnboardingStatus(): Promise<DataResponse<OnboardingStatus>> {
	return apiClient.get<DataResponse<OnboardingStatus>>('/onboarding/status');
}

function completeOnboarding(): Promise<DataResponse<OnboardingStatus>> {
	return apiClient.post<DataResponse<OnboardingStatus>>('/onboarding/complete');
}

function resetOnboarding(): Promise<DataResponse<OnboardingStatus>> {
	return apiClient.post<DataResponse<OnboardingStatus>>('/onboarding/reset');
}

export { completeOnboarding, getOnboardingStatus, onboardingKeys, resetOnboarding };
export type { OnboardingStep };
