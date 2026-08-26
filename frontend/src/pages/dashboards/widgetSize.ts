import type { WidgetType } from 'spernakit-shared';

/**
 * Widget size bounds and their validators.
 *
 * These mirror `widgetSchema` in `backend/src/routes/dashboards/schemas.ts`, which bounds width at
 * 12 columns and height at 24 rows. The dialog's Add button is an onClick handler rather than a
 * form submit, so the inputs' `min`/`max` attributes are never enforced by the browser and an
 * out-of-range value reaches the API, where it comes back as a rejection that names no field.
 * Every bound here therefore has to be checked in JavaScript to produce a message at all.
 *
 * The height ceiling is the grid's, not a client preference: 24 rows of 80px is 1920px, taller
 * than any viewport the dashboard is laid out for. It has to stay equal to the server's, because
 * a client ceiling below it refuses a widget the API would accept and one above it lets a value
 * through to a rejection with no field name.
 */
const WIDGET_HEIGHT_MAX = 24;
const WIDGET_WIDTH_MAX = 12;
const WIDGET_WIDTH_MIN = 1;

/**
 * The shortest each widget type may be, in grid rows.
 *
 * The server's floor is 1, and 1 is not a height any of these widgets can actually render at: a
 * row is 80px, the widget card spends 24px of it on its own vertical padding, and what remains
 * does not hold a title line plus the `text-2xl` value a stat card, gauge or health tile exists to
 * display — the number rendered below the bottom edge of its own card. Charts and lists get 3
 * because a plot area under 160px is a line, not a chart.
 *
 * This is a client floor, deliberately stricter than the API's. It is enforced in three places for
 * the three ways a widget gets its height: this validator for the Add Widget dialog, `minH` on the
 * grid layout for the resize handles, and a raise in `widgetsToLayout` for heights already stored
 * below it.
 *
 * Only the first two of those decide what is stored. The raise is a read-time repair: it makes an
 * undersized widget legible without rewriting the record, because a floor the user never asked for
 * should not become the height they are recorded as having chosen.
 */
const WIDGET_MIN_ROWS: Record<WidgetType, number> = {
	alert_list: 2,
	bar_chart: 3,
	gauge: 2,
	health_status: 2,
	line_chart: 3,
	stat_card: 2,
	table: 3,
};

/** The row floor for a widget type. Falls back to 2 so an unrecognised type is never allowed 1. */
function getWidgetMinRows(widgetType: WidgetType): number {
	return WIDGET_MIN_ROWS[widgetType] ?? 2;
}

/**
 * Returns the validation message for a widget width, or null when it is acceptable.
 *
 * `Number.isInteger` carries the non-integer cases as well as the range check: the inputs pass
 * `Number(e.target.value)` straight through, which yields `NaN` for an unparseable value and
 * `0` for an empty one, and a decimal typed into a number input arrives intact.
 */
function getWidgetWidthError(width: number): null | string {
	if (!Number.isInteger(width)) {
		return `Width must be a whole number between ${String(WIDGET_WIDTH_MIN)} and ${String(WIDGET_WIDTH_MAX)}`;
	}
	if (width < WIDGET_WIDTH_MIN || width > WIDGET_WIDTH_MAX) {
		return `Width must be between ${String(WIDGET_WIDTH_MIN)} and ${String(WIDGET_WIDTH_MAX)}`;
	}
	return null;
}

/**
 * Returns the validation message for a widget height, or null when it is acceptable.
 *
 * The floor depends on the widget type, so the message names the number the user has to reach
 * rather than a generic minimum they would have to discover by trying.
 */
function getWidgetHeightError(height: number, widgetType: WidgetType): null | string {
	const min = getWidgetMinRows(widgetType);
	if (!Number.isInteger(height)) {
		return `Height must be a whole number between ${String(min)} and ${String(WIDGET_HEIGHT_MAX)}`;
	}
	if (height < min) {
		return `Height must be ${String(min)} or more for this widget type`;
	}
	if (height > WIDGET_HEIGHT_MAX) {
		return `Height must be ${String(WIDGET_HEIGHT_MAX)} or less`;
	}
	return null;
}

export {
	getWidgetHeightError,
	getWidgetMinRows,
	getWidgetWidthError,
	WIDGET_HEIGHT_MAX,
	WIDGET_WIDTH_MAX,
	WIDGET_WIDTH_MIN,
};
