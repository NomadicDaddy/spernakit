/**
 * Backend-vs-frontend enum consistency validation.
 *
 * Extracted from scripts/validate-api-types.ts (max-lines split). Compares
 * TypeBox union schemas from backend/src/schemas/domain.ts against the
 * string-literal unions declared in frontend/shared source files.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TypeBoxUnionSchema } from './enum-sources.ts';

import {
	ApiKeyScopeSchema,
	NotificationTypeSchema,
	UserRoleSchema,
} from '../../../backend/src/schemas/domain.ts';
import { extractTypeBoxEnumValues, extractUnionValuesFromSource } from './enum-sources.ts';

export interface EnumMismatch {
	backendValues: string[];
	frontendValues: string[];
	missingInBackend: string[];
	missingInFrontend: string[];
	name: string;
}

interface EnumDefinition {
	backendSchema: TypeBoxUnionSchema;
	frontendFile: string;
	frontendTypeName: string;
	name: string;
}

const FRONTEND_TYPES_DIR = join(
	import.meta.dirname,
	'..',
	'..',
	'..',
	'frontend',
	'src',
	'api',
	'types'
);

const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..');

/** All enum/union types to validate between backend and frontend.
 *  `frontendFile` is relative to project root if it contains '/', otherwise
 *  relative to frontend/src/api/types/. Points at shared/src/ for types that
 *  have been promoted to spernakit-shared. */
const ENUM_DEFINITIONS: EnumDefinition[] = [
	{
		backendSchema: UserRoleSchema as unknown as TypeBoxUnionSchema,
		frontendFile: 'shared/src/roles.ts',
		frontendTypeName: 'UserRole',
		name: 'UserRole',
	},
	{
		backendSchema: NotificationTypeSchema as unknown as TypeBoxUnionSchema,
		frontendFile: 'shared/src/notificationTypes.ts',
		frontendTypeName: 'NotificationType',
		name: 'NotificationType',
	},
	{
		backendSchema: ApiKeyScopeSchema as unknown as TypeBoxUnionSchema,
		frontendFile: 'shared/src/apiKeyScopes.ts',
		frontendTypeName: 'ApiKeyScope',
		name: 'ApiKeyScope',
	},
];

/** WorkspaceMemberRole is declared in spernakit-shared but not surfaced as a
 *  TypeBox schema (it is not used in any route schema). We hand-pin the
 *  backend values and validate that the shared declaration stays in sync. */
const WORKSPACE_MEMBER_ROLE_VALUES = ['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'];

export function validateEnums(): EnumMismatch[] {
	const mismatches: EnumMismatch[] = [];

	for (const def of ENUM_DEFINITIONS) {
		const backendValues = extractTypeBoxEnumValues(def.backendSchema);
		const frontendFile = def.frontendFile.includes('/')
			? join(PROJECT_ROOT, def.frontendFile)
			: join(FRONTEND_TYPES_DIR, def.frontendFile);

		let content: string;
		try {
			content = readFileSync(frontendFile, 'utf8');
		} catch {
			mismatches.push({
				backendValues,
				frontendValues: [],
				missingInBackend: [],
				missingInFrontend: backendValues,
				name: def.name,
			});
			continue;
		}

		const frontendValues = extractUnionValuesFromSource(content, def.frontendTypeName);
		if (frontendValues === null) {
			mismatches.push({
				backendValues,
				frontendValues: [],
				missingInBackend: [],
				missingInFrontend: backendValues,
				name: def.name,
			});
			continue;
		}

		const missingInFrontend = backendValues.filter((v) => !frontendValues.includes(v));
		const missingInBackend = frontendValues.filter((v) => !backendValues.includes(v));

		if (missingInFrontend.length > 0 || missingInBackend.length > 0) {
			mismatches.push({
				backendValues,
				frontendValues,
				missingInBackend,
				missingInFrontend,
				name: def.name,
			});
		}
	}

	// WorkspaceMemberRole — declared in shared/src/workspaceRoles.ts; not a TypeBox schema.
	const wsmrFilePath = join(PROJECT_ROOT, 'shared/src/workspaceRoles.ts');
	let wsmrContent: string;
	try {
		wsmrContent = readFileSync(wsmrFilePath, 'utf8');
	} catch {
		mismatches.push({
			backendValues: WORKSPACE_MEMBER_ROLE_VALUES,
			frontendValues: [],
			missingInBackend: [],
			missingInFrontend: WORKSPACE_MEMBER_ROLE_VALUES,
			name: 'WorkspaceMemberRole',
		});
		return mismatches;
	}
	const wsmrFrontend = extractUnionValuesFromSource(wsmrContent, 'WorkspaceMemberRole');
	if (wsmrFrontend === null) {
		mismatches.push({
			backendValues: WORKSPACE_MEMBER_ROLE_VALUES,
			frontendValues: [],
			missingInBackend: [],
			missingInFrontend: WORKSPACE_MEMBER_ROLE_VALUES,
			name: 'WorkspaceMemberRole',
		});
	} else {
		const sorted = [...WORKSPACE_MEMBER_ROLE_VALUES].sort();
		const missingInFrontend = sorted.filter((v) => !wsmrFrontend.includes(v));
		const missingInBackend = wsmrFrontend.filter((v) => !sorted.includes(v));

		if (missingInFrontend.length > 0 || missingInBackend.length > 0) {
			mismatches.push({
				backendValues: sorted,
				frontendValues: wsmrFrontend,
				missingInBackend,
				missingInFrontend,
				name: 'WorkspaceMemberRole',
			});
		}
	}

	return mismatches;
}
