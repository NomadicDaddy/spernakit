import { t } from 'elysia';
import { METRIC_TYPES, type MetricType, WIDGET_TYPES, type WidgetType } from 'spernakit-shared';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	FIELD_LENGTH_MEDIUM,
	FIELD_LENGTH_SHORT,
	MAX_PROPERTIES_DEFAULT,
} from '../../constants/validation.ts';
import { notFoundError } from '../../utils/errorResponse.ts';

const metricTypeLiterals = METRIC_TYPES.map((v) => t.Literal(v)) as [
	ReturnType<typeof t.Literal<MetricType>>,
	ReturnType<typeof t.Literal<MetricType>>,
	...ReturnType<typeof t.Literal<MetricType>>[],
];

const widgetTypeLiterals = WIDGET_TYPES.map((v) => t.Literal(v)) as [
	ReturnType<typeof t.Literal<WidgetType>>,
	ReturnType<typeof t.Literal<WidgetType>>,
	...ReturnType<typeof t.Literal<WidgetType>>[],
];

const widgetSchema = t.Object({
	col: t.Integer({ minimum: 0 }),
	height: t.Integer({ minimum: 1 }),
	metricType: t.Union(metricTypeLiterals),
	options: t.Optional(
		t.Record(
			t.String({ maxLength: FIELD_LENGTH_MEDIUM }),
			t.Union([t.String({ maxLength: 2000 }), t.Number(), t.Boolean(), t.Null()]),
			{ maxProperties: MAX_PROPERTIES_DEFAULT }
		)
	),
	refreshInterval: t.Optional(t.Integer({ minimum: 5 })),
	row: t.Integer({ minimum: 0 }),
	timeRange: t.Optional(t.String({ maxLength: FIELD_LENGTH_SHORT })),
	title: t.String({ maxLength: FIELD_LENGTH_MEDIUM, minLength: 1 }),
	widgetType: t.Union(widgetTypeLiterals),
	width: t.Integer({ maximum: 12, minimum: 1 }),
});

/**
 * Guard that returns a NOT_FOUND error when dashboards are disabled.
 * Used as onBeforeHandle in all dashboard route groups.
 */
function guardDashboardsEnabled({ set }: { set: { status?: number | string } }) {
	if (!getConfig().dashboards.enabled) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Resource');
	}
	return undefined;
}

export { guardDashboardsEnabled, widgetSchema };
