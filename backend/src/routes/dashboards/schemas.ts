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

/**
 * Grid geometry bounds. The dashboard grid is `DASHBOARD_COLS.lg` = 12 columns wide with 80px
 * rows (`frontend/src/hooks/dashboards/useDashboardLayout.ts`), so every one of these is a real
 * limit of the surface the widget is drawn on rather than an arbitrary number:
 *
 * - `WIDGET_COL_MAX` is the last column a widget can start in and still be inside the grid.
 * - `WIDGET_HEIGHT_MAX` is 1920px, taller than any viewport the grid is laid out for.
 * - `WIDGET_ROW_MAX` bounds how far down a dashboard can be seeded. The grid compacts vertically,
 *   so a row past the widgets that exist collapses anyway; this only stops a stored value that
 *   would place a widget outside any reachable scroll position.
 *
 * Without a ceiling a height of 9999 saved cleanly and rendered a 799,920px dashboard the user
 * could not scroll back out of. `frontend/src/pages/dashboards/widgetSize.ts` mirrors these.
 */
const WIDGET_COL_MAX = 11;
const WIDGET_HEIGHT_MAX = 24;
const WIDGET_ROW_MAX = 100;
const WIDGET_WIDTH_MAX = 12;

const widgetSchema = t.Object({
	col: t.Integer({ maximum: WIDGET_COL_MAX, minimum: 0 }),
	height: t.Integer({ maximum: WIDGET_HEIGHT_MAX, minimum: 1 }),
	metricType: t.Union(metricTypeLiterals),
	options: t.Optional(
		t.Record(
			t.String({ maxLength: FIELD_LENGTH_MEDIUM }),
			t.Union([t.String({ maxLength: 2000 }), t.Number(), t.Boolean(), t.Null()]),
			{ maxProperties: MAX_PROPERTIES_DEFAULT },
		),
	),
	refreshInterval: t.Optional(t.Integer({ minimum: 5 })),
	row: t.Integer({ maximum: WIDGET_ROW_MAX, minimum: 0 }),
	timeRange: t.Optional(t.String({ maxLength: FIELD_LENGTH_SHORT })),
	title: t.String({ maxLength: FIELD_LENGTH_MEDIUM, minLength: 1 }),
	widgetType: t.Union(widgetTypeLiterals),
	width: t.Integer({ maximum: WIDGET_WIDTH_MAX, minimum: 1 }),
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
