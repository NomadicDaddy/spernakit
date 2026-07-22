import { Elysia, t } from 'elysia';

import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../constants/responseExamples.ts';
import {
	DATE_RANGE_DEFAULT_DAYS,
	DATE_RANGE_MAX_DAYS,
	FIELD_LENGTH_MEDIUM,
	MAX_PROPERTIES_DEFAULT,
} from '../constants/validation.ts';
import { assertUser, requireAuth, requireRoleFresh } from '../guards/role.ts';
import { authPlugin } from '../plugins/auth.ts';
import {
	getDashboardStats,
	getEventSummary,
	getUserActivity,
	trackEvent,
} from '../services/metricsService.ts';
import { dataResponse, successResponse } from '../utils/apiResponse.ts';
import { setCacheHeaders } from '../utils/caching.ts';

const businessMetricsRoutes = new Elysia({
	detail: { tags: ['Business Metrics'] },
	prefix: '/business-metrics',
})
	.use(authPlugin)
	.get(
		'/dashboard',
		({ query, set }) => {
			setCacheHeaders(set, 'MEDIUM');
			return dataResponse(getDashboardStats(query.days));
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('OPERATOR')({ set, user }),
			detail: {
				description:
					'Returns business metrics dashboard statistics including daily/monthly active ' +
					'users, conversion rates (registrations, workspace creations, file uploads), ' +
					'top features by usage, and total event count. Default lookback is 30 days. ' +
					'Requires OPERATOR role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Business metrics dashboard', {
										conversionRates: {
											fileUploads: 42,
											registrations: 8,
											workspaceCreations: 5,
										},
										dailyActiveUsers: 12,
										monthlyActiveUsers: 35,
										topFeatures: [
											{ count: 150, eventName: 'page_view' },
											{ count: 42, eventName: 'file_uploaded' },
										],
										totalEvents: 1250,
									}),
								},
							},
						},
						description: 'Business metrics dashboard statistics.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get business metrics dashboard (OPERATOR+)',
			},
			query: t.Object({
				days: t.Optional(
					t.Numeric({
						default: DATE_RANGE_DEFAULT_DAYS,
						maximum: DATE_RANGE_MAX_DAYS,
						minimum: 1,
					})
				),
			}),
		}
	)
	.get(
		'/events',
		({ query, set }) => {
			setCacheHeaders(set, 'MEDIUM');
			return dataResponse(getEventSummary(query.days, query.limit));
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('OPERATOR')({ set, user }),
			detail: {
				description:
					'Returns event summary grouped by category and name for the specified time ' +
					'window. Useful for understanding which events are most common. ' +
					'Requires OPERATOR role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Event summary', [
										{
											count: 150,
											eventCategory: 'feature_usage',
											eventName: 'page_view',
										},
										{
											count: 45,
											eventCategory: 'user_action',
											eventName: 'login',
										},
									]),
								},
							},
						},
						description: 'Event summary grouped by category and name.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get event summary (OPERATOR+)',
			},
			query: t.Object({
				days: t.Optional(
					t.Numeric({
						default: DATE_RANGE_DEFAULT_DAYS,
						maximum: DATE_RANGE_MAX_DAYS,
						minimum: 1,
					})
				),
				limit: t.Optional(
					t.Numeric({
						default: 20,
						maximum: 100,
						minimum: 1,
					})
				),
			}),
		}
	)
	.get(
		'/user-activity/:userId',
		({ params, query, set }) => {
			setCacheHeaders(set, 'MEDIUM');
			return dataResponse(getUserActivity(Number(params.userId), query.days));
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Returns activity metrics for a specific user including total events, ' +
					'breakdown by category, and recent events. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('User activity', {
										byCategory: [
											{ count: 30, eventCategory: 'user_action' },
											{ count: 15, eventCategory: 'feature_usage' },
										],
										recentEvents: [
											{
												createdAt: '2026-02-03T10:00:00.000Z',
												eventCategory: 'user_action',
												eventName: 'login',
												metadata: null,
											},
										],
										totalEvents: 45,
									}),
								},
							},
						},
						description: 'User activity metrics.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get user activity metrics (ADMIN+)',
			},
			params: t.Object({
				userId: t.Numeric({ minimum: 1 }),
			}),
			query: t.Object({
				days: t.Optional(
					t.Numeric({
						default: DATE_RANGE_DEFAULT_DAYS,
						maximum: DATE_RANGE_MAX_DAYS,
						minimum: 1,
					})
				),
			}),
		}
	)
	.post(
		'/track',
		({ body, user }) => {
			const authUser = assertUser(user);

			trackEvent({
				eventCategory: body.eventCategory,
				eventName: body.eventName,
				...(body.metadata !== undefined && body.metadata !== null
					? { metadata: body.metadata }
					: {}),
				userId: authUser.id,
			});

			return successResponse();
		},
		{
			beforeHandle: requireAuth,
			body: t.Object({
				eventCategory: t.Union([
					t.Literal('conversion'),
					t.Literal('feature_usage'),
					t.Literal('user_action'),
				]),
				eventName: t.String({ maxLength: 200, minLength: 1 }),
				metadata: t.Optional(
					t.Union([
						t.Null(),
						t.Record(
							t.String({ maxLength: FIELD_LENGTH_MEDIUM }),
							t.Union([
								t.String({ maxLength: 500 }),
								t.Number(),
								t.Boolean(),
								t.Null(),
							]),
							{ maxProperties: MAX_PROPERTIES_DEFAULT }
						),
					])
				),
			}),
			detail: {
				description:
					'Track a business event from the frontend. The userId is automatically set ' +
					'from the authenticated user. Valid event categories: user_action, ' +
					'conversion, feature_usage. Returns success response.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: {
										summary: 'Event tracked',
										value: { data: null, message: 'OK', success: true },
									},
								},
							},
						},
						description: 'Event tracked successfully.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Track a business event',
			},
		}
	);

export { businessMetricsRoutes };
