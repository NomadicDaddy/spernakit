/**
 * Widget size bounds and their validators.
 *
 * These mirror `widgetSchema` in `backend/src/routes/dashboards/schemas.ts`, which declares
 * `width: t.Integer({ maximum: 12, minimum: 1 })` and `height: t.Integer({ minimum: 1 })`.
 * The dialog's Add button is an onClick handler rather than a form submit, so the inputs'
 * `min`/`max` attributes are never enforced by the browser and an out-of-range value reaches
 * the API, where it comes back as a rejection that names no field.
 *
 * Height deliberately has no maximum here. The server does not impose one, and a client-only
 * ceiling would refuse a widget the API would have accepted.
 */
const WIDGET_HEIGHT_MIN = 1;
const WIDGET_WIDTH_MAX = 12;
const WIDGET_WIDTH_MIN = 1;

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

/** Returns the validation message for a widget height, or null when it is acceptable. */
function getWidgetHeightError(height: number): null | string {
	if (!Number.isInteger(height)) {
		return `Height must be a whole number of ${String(WIDGET_HEIGHT_MIN)} or more`;
	}
	if (height < WIDGET_HEIGHT_MIN) {
		return `Height must be ${String(WIDGET_HEIGHT_MIN)} or more`;
	}
	return null;
}

export {
	getWidgetHeightError,
	getWidgetWidthError,
	WIDGET_HEIGHT_MIN,
	WIDGET_WIDTH_MAX,
	WIDGET_WIDTH_MIN,
};
