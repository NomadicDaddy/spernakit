import { and, count, eq, gt } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { settings } from '../db/schema/settings.ts';
import { users } from '../db/schema/users.ts';
import { SEED_USER_COUNT } from '../utils/auth/passwordGenerator.ts';
import { getByKeys } from './settingsService.ts';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Constants                                                                   */
/* -------------------------------------------------------------------------- */

const ONBOARDING_COMPLETED_KEY = 'onboarding.completed';
const ONBOARDING_COMPLETED_AT_KEY = 'onboarding.completedAt';
const ONBOARDING_COMPLETED_BY_KEY = 'onboarding.completedBy';
const ONBOARDING_RESET_AT_KEY = 'onboarding.resetAt';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function countNonSeedUsers(afterDate?: Date): number {
	const db = getDb();
	if (afterDate) {
		// Count users created after the given date (post-reset)
		const result = db
			.select({ value: count() })
			.from(users)
			.where(and(eq(users.isDeleted, false), gt(users.createdAt, afterDate)))
			.get();
		return (result?.value ?? 0) > 0 ? 1 : 0;
	}
	const result = db
		.select({ value: count() })
		.from(users)
		.where(eq(users.isDeleted, false))
		.get();
	// The first SEED_USER_COUNT users are seed accounts; any additional means an admin created one.
	// SEED_USER_COUNT is derived from the actual seed user definitions, not a magic number.
	return (result?.value ?? 0) > SEED_USER_COUNT ? 1 : 0;
}

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

function setSetting(key: string, value: string, userId: number, tx?: DbTransaction): void {
	const client = tx ?? getDb();
	client
		.insert(settings)
		.values({ createdBy: userId, key, updatedBy: userId, value })
		.onConflictDoUpdate({
			set: { updatedAt: new Date(), updatedBy: userId, value },
			target: settings.key,
		})
		.run();
}

/* -------------------------------------------------------------------------- */
/*  Service functions                                                           */
/* -------------------------------------------------------------------------- */

function getOnboardingStatus(): OnboardingStatus {
	const settingsMap = getByKeys([
		ONBOARDING_COMPLETED_KEY,
		ONBOARDING_COMPLETED_AT_KEY,
		ONBOARDING_COMPLETED_BY_KEY,
		ONBOARDING_RESET_AT_KEY,
	]);
	const isCompleted = settingsMap.get(ONBOARDING_COMPLETED_KEY)?.value === 'true';
	const completedAt = settingsMap.get(ONBOARDING_COMPLETED_AT_KEY)?.value ?? null;
	const completedByStr = settingsMap.get(ONBOARDING_COMPLETED_BY_KEY)?.value ?? null;
	const completedBy = completedByStr ? parseInt(completedByStr, 10) : null;

	const resetAtStr = settingsMap.get(ONBOARDING_RESET_AT_KEY)?.value ?? null;
	const resetAt = resetAtStr ? new Date(resetAtStr) : undefined;

	const hasAdditionalUsers = countNonSeedUsers(resetAt) > 0;

	const steps: OnboardingStep[] = [
		{
			completed: true,
			description: 'Log in with the default sysop account and change the default password.',
			id: 'login',
			link: '/profile/personal',
			title: 'Sign in as administrator',
		},
		{
			completed: hasAdditionalUsers,
			description:
				'Invite team members by creating additional user accounts with appropriate roles.',
			id: 'add-users',
			link: '/settings/users',
			title: 'Add team members',
		},
	];

	return {
		completedAt: completedAt ?? null,
		completedBy: completedBy ?? null,
		isComplete: isCompleted,
		steps,
	};
}

function completeOnboarding(userId: number): OnboardingStatus {
	const now = new Date().toISOString();
	const db = getDb();
	db.transaction((tx) => {
		setSetting(ONBOARDING_COMPLETED_KEY, 'true', userId, tx);
		setSetting(ONBOARDING_COMPLETED_AT_KEY, now, userId, tx);
		setSetting(ONBOARDING_COMPLETED_BY_KEY, String(userId), userId, tx);
	});
	return getOnboardingStatus();
}

function resetOnboarding(userId: number): OnboardingStatus {
	const now = new Date().toISOString();
	const db = getDb();
	db.transaction((tx) => {
		setSetting(ONBOARDING_COMPLETED_KEY, 'false', userId, tx);
		setSetting(ONBOARDING_RESET_AT_KEY, now, userId, tx);
		tx.update(settings)
			.set({ deletedAt: new Date(), deletedBy: userId, isDeleted: true })
			.where(eq(settings.key, ONBOARDING_COMPLETED_AT_KEY))
			.run();
		tx.update(settings)
			.set({ deletedAt: new Date(), deletedBy: userId, isDeleted: true })
			.where(eq(settings.key, ONBOARDING_COMPLETED_BY_KEY))
			.run();
	});
	return getOnboardingStatus();
}

export { completeOnboarding, getOnboardingStatus, resetOnboarding };
export type { OnboardingStatus, OnboardingStep };
