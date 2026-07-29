/**
 * Shared types and template branding constants for template drift detection
 * and upgrade scripts.
 */

// ===== TYPES =====

export interface ClassificationOverrides {
	branded: string[];
	buildCriticalBranded: string[];
	infrastructure: string[];
	securityInfrastructure: string[];
}

export type DriftCategory = 'branded' | 'infrastructure' | 'pure' | 'security-infrastructure';

export type TemplateOverrideAction = 'DELETED' | 'KEEP' | 'SKIP';

export interface TemplateOverrides {
	deleted: Map<string, string>;
	keep: Map<string, string>;
	skip: Map<string, string>;
}

export interface FileResult {
	category: DriftCategory;
	filePath: string;
	/** Build-critical branded drift gets a distinct failing report without changing its category. */
	severity?: 'build-critical';
	status: 'drifted' | 'identical' | 'missing-in-app' | 'missing-in-template' | 'suppressed';
	/** Template lines absent from a build-critical branded file after branding normalization. */
	structuralMissingLines?: string[];
	/** When status === 'suppressed', records why and which override action applied */
	suppression?: { action: TemplateOverrideAction; reason: string };
}

export interface BrandingValues {
	backendPort: string;
	description: string;
	frontendPort: string;
	name: string;
	slug: string;
}

// ===== CONSTANTS =====

// Template defaults (the values in the spernakit template before setup.ts runs)
export const TEMPLATE_BRANDING: BrandingValues = {
	backendPort: '3331',
	description: 'Spernakit v3 - Self-Hosted Multi-User Application Template',
	frontendPort: '3330',
	name: 'Spernakit v3',
	slug: 'spernakit',
};
