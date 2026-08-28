import { and, count, eq, gt, isNull, or } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { settings } from '../db/schema/settings.ts';
import { users } from '../db/schema/users.ts';
import { getSeedIdentity, SEED_USER_COUNT } from '../utils/auth/passwordGenerator.ts';
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

/**
 * Whether the seeded SYSOP account still carries the password it was created with.
 *
 * `passwordChangedAt` is null until a password is changed, and every path that changes one sets
 * it: `changeUserPassword` in auth/authCore.ts, the reset in auth/authPasswordReset.ts, and the
 * administrator reset in user/userPasswordAdminService.ts. `requiresPasswordChange` covers the
 * last of those, where the timestamp moves but the account holder has still not chosen a password
 * of their own. Either one outstanding means the account is not yet on a password its holder
 * picked.
 *
 * The check is scoped to the SYSOP seed account rather than to every seeded account, for two
 * reasons. It is the account whose default is published in the project's own documentation and
 * whose privileges make an unchanged one worth a checklist line. And an administrator reset raises
 * `requiresPasswordChange` on the target, so counting the other four would hold the step open
 * until every one of viewer, operator, manager and admin had logged in and changed a password by
 * hand — a step that cannot be finished, on a checklist whose Complete button is gated on all
 * steps being done.
 *
 * A missing row is treated as nothing to do. An installation that deleted or renamed its seeded
 * SYSOP account is past the default this step is about.
 *
 * @returns True while the seeded SYSOP account is still on a password its holder did not choose.
 */
function sysopIsOnItsSeededPassword(): boolean {
	const identity = getSeedIdentity('SYSOP');
	if (!identity) return false;
	const db = getDb();
	const row = db
		.select({ id: users.id })
		.from(users)
		.where(
			and(
				eq(users.isDeleted, false),
				eq(users.username, identity.username),
				or(isNull(users.passwordChangedAt), eq(users.requiresPasswordChange, true)),
			),
		)
		.get();
	return row !== undefined;
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

	const steps = getDefaultOnboardingSteps(resetAt);

	return {
		completedAt: completedAt ?? null,
		completedBy: completedBy ?? null,
		isComplete: isCompleted,
		steps,
	};
}

/**
 * The step that reports on the seeded SYSOP password, on its own.
 *
 * Exported separately from the baseline list because a derived app is expected to supply its own
 * steps (onboarding-system spec lines 3 and 17) and may not want the template's other two. This is
 * the one step in the list that makes a security claim, so an app writing its own list can include
 * it without copying the query that backs it. Reimplementing this step is how it goes back to
 * being a literal.
 *
 * @returns The password-change step, complete once the seeded SYSOP password has been changed.
 */
function getPasswordChangeStep(): OnboardingStep {
	const outstanding = sysopIsOnItsSeededPassword();
	return {
		completed: !outstanding,
		description: outstanding
			? 'The sysop account still has the password it was created with. Change it from that account so the documented default stops working.'
			: 'The sysop account is no longer on the password it was created with.',
		id: 'change-sysop-password',
		link: '/profile/personal',
		title: 'Change the default sysop password',
	};
}

/**
 * The template's baseline checklist.
 *
 * A derived app supplying domain-specific steps composes this rather than retyping it, so a later
 * correction to a baseline step reaches the app instead of stopping at the template.
 *
 * @param resetAt - When onboarding was last reset, so the add-users step counts from there.
 * @returns The baseline steps, in the order they are shown.
 */
function getDefaultOnboardingSteps(resetAt?: Date): OnboardingStep[] {
	return [
		{
			completed: true,
			description: 'You are signed in, so this one is already done.',
			id: 'login',
			link: '/dashboard',
			title: 'Sign in as administrator',
		},
		getPasswordChangeStep(),
		{
			completed: countNonSeedUsers(resetAt) > 0,
			description:
				'Invite team members by creating additional user accounts with appropriate roles.',
			id: 'add-users',
			link: '/settings/users',
			title: 'Add team members',
		},
	];
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

export {
	completeOnboarding,
	getDefaultOnboardingSteps,
	getOnboardingStatus,
	getPasswordChangeStep,
	resetOnboarding,
};
export type { OnboardingStatus, OnboardingStep };
