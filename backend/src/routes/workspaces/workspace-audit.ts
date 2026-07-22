interface WorkspaceSettingsBranding {
	accentColor?: string;
	logoFileId?: number;
}

interface WorkspaceSettingsInput {
	branding?: WorkspaceSettingsBranding;
	currency?: string;
	defaultDashboardId?: number;
	timezone?: string;
}

interface WorkspaceUpdateAuditInput {
	description?: string;
	name?: string;
	settings?: WorkspaceSettingsInput;
}

function buildWorkspaceUpdateAuditDetails(
	body: WorkspaceUpdateAuditInput,
	beforeSettings: null | WorkspaceSettingsInput
): Record<string, unknown> {
	const auditDetails: Record<string, unknown> = {};
	if (body.name !== undefined) auditDetails.name = body.name;
	if (body.description !== undefined) auditDetails.description = body.description;
	if (body.settings === undefined) return auditDetails;

	const settingsDiff: Record<string, { after: unknown; before: unknown }> = {};
	const keys = new Set([...Object.keys(beforeSettings ?? {}), ...Object.keys(body.settings)]);
	for (const key of keys) {
		const before = (beforeSettings as null | Record<string, unknown>)?.[key];
		const after = (body.settings as Record<string, unknown>)[key];
		if (JSON.stringify(before) !== JSON.stringify(after)) {
			settingsDiff[key] = { after, before };
		}
	}
	if (Object.keys(settingsDiff).length > 0) auditDetails.settingsDiff = settingsDiff;

	return auditDetails;
}

export { buildWorkspaceUpdateAuditDetails };
export type { WorkspaceSettingsBranding, WorkspaceSettingsInput };
