/**
 * Parse a comma-separated fields query parameter into an array of field names.
 * Returns null if the parameter is empty or undefined (meaning "return all fields").
 *
 * @param fieldsParam - Raw comma-separated field string (e.g. "id,name,email")
 * @returns Array of trimmed field names, or null if no selection
 */
function parseFields(fieldsParam: string | undefined): null | string[] {
	if (!fieldsParam) return null;
	const fields = fieldsParam
		.split(',')
		.map((f) => f.trim())
		.filter((f) => f.length > 0);
	return fields.length > 0 ? fields : null;
}

/**
 * Validate requested fields against an allowed whitelist.
 * Returns only the fields that are in the allowed set.
 * Returns null if no valid fields remain (caller should treat as "all fields").
 *
 * @param requested - Requested field names
 * @param allowed - Set of allowed field names for this endpoint
 * @returns Validated field names, or null if none are valid
 */
function validateFields(requested: null | string[], allowed: ReadonlySet<string>): null | string[] {
	if (!requested) return null;
	const valid = requested.filter((f) => allowed.has(f));
	return valid.length > 0 ? valid : null;
}

/**
 * Project (pick) only the specified fields from each item in a data array.
 * If fields is null, returns the data unchanged.
 *
 * @param data - Array of objects to project
 * @param fields - Field names to keep, or null for all fields
 * @returns Array with only the selected fields per item
 */
function projectFields<T extends object>(data: T[], fields: null | string[]): Partial<T>[] {
	if (!fields) return data;
	return data.map((item) => {
		const projected: Record<string, unknown> = {};
		for (const field of fields) {
			if (field in item) {
				projected[field] = (item as Record<string, unknown>)[field];
			}
		}
		return projected as Partial<T>;
	});
}

/** Allowed fields for the user list endpoint */
const USER_LIST_FIELDS = new Set([
	'createdAt',
	'email',
	'failedLoginAttempts',
	'id',
	'lastLoginAt',
	'lockedUntil',
	'role',
	'updatedAt',
	'username',
]);

/** Allowed fields for the notification list endpoint */
const NOTIFICATION_LIST_FIELDS = new Set([
	'createdAt',
	'id',
	'isDeleted',
	'message',
	'metadata',
	'readAt',
	'title',
	'type',
	'userId',
	'workspaceId',
]);

/** Allowed fields for the audit log list endpoint */
const AUDIT_LIST_FIELDS = new Set([
	'action',
	'createdAt',
	'details',
	'id',
	'ipAddress',
	'resource',
	'resourceId',
	'userId',
	'username',
]);

export {
	AUDIT_LIST_FIELDS,
	NOTIFICATION_LIST_FIELDS,
	parseFields,
	projectFields,
	USER_LIST_FIELDS,
	validateFields,
};
