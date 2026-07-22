import { Elysia } from 'elysia';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { dataExample, UNAUTHORIZED_EXAMPLE } from '../constants/responseExamples.ts';
import { assertUser, requireAuth, requireRoleFresh } from '../guards/role.ts';
import { authPlugin } from '../plugins/auth.ts';
import { log as logAudit } from '../services/auditService.ts';
import {
	completeOnboarding,
	getOnboardingStatus,
	resetOnboarding,
} from '../services/onboardingService.ts';
import { dataResponse } from '../utils/apiResponse.ts';
import { setCacheHeaders } from '../utils/caching.ts';

const onboardingRoutes = new Elysia({
	detail: { tags: ['Onboarding'] },
	prefix: '/onboarding',
})
	.use(authPlugin)
	.get(
		'/status',
		({ set, user }) => {
			assertUser(user);
			setCacheHeaders(set, 'NO_CACHE');
			return dataResponse(getOnboardingStatus());
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Returns the current onboarding status including a checklist of setup steps ' +
					'with completion state computed from existing data.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Onboarding status', {
										completedAt: null,
										completedBy: null,
										isComplete: false,
										steps: [
											{
												completed: true,
												description:
													'Log in with the default sysop account.',
												id: 'login',
												link: '/profile/personal',
												title: 'Sign in as administrator',
											},
										],
									}),
								},
							},
						},
						description: 'Current onboarding status with checklist.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Get onboarding status',
			},
		}
	)
	.post(
		'/complete',
		({ set, user }) => {
			const authedUser = assertUser(user);
			const result = completeOnboarding(authedUser.id);
			logAudit({
				action: 'ONBOARDING_COMPLETE',
				entityType: 'onboarding',
				userId: authedUser.id,
			});
			set.status = HTTP_STATUS.OK;
			return dataResponse(result);
		},
		{
			beforeHandle: requireRoleFresh('ADMIN'),
			detail: {
				description:
					'Marks onboarding as completed for the current admin user. ' +
					'Records who completed it and when.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Onboarding completed', {
										completedAt: '2026-03-04T12:00:00.000Z',
										completedBy: 1,
										isComplete: true,
										steps: [],
									}),
								},
							},
						},
						description: 'Updated onboarding status.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Complete onboarding',
			},
		}
	)
	.post(
		'/reset',
		({ set, user }) => {
			const authedUser = assertUser(user);
			const result = resetOnboarding(authedUser.id);
			logAudit({
				action: 'ONBOARDING_RESET',
				entityType: 'onboarding',
				userId: authedUser.id,
			});
			set.status = HTTP_STATUS.OK;
			return dataResponse(result);
		},
		{
			beforeHandle: requireRoleFresh('ADMIN'),
			detail: {
				description:
					'Resets onboarding status so the checklist appears again. ' +
					'Useful for re-running the onboarding flow.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Onboarding reset', {
										completedAt: null,
										completedBy: null,
										isComplete: false,
										steps: [],
									}),
								},
							},
						},
						description: 'Reset onboarding status.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Reset onboarding',
			},
		}
	);

export { onboardingRoutes };
