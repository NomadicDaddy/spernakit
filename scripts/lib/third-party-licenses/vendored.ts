import { join } from 'node:path';

import { byCodepoint } from '../license-core/order.ts';

const RECORD_PATH = 'licenses/vendored-materials.json';
const SHADCN_ROOT = 'frontend/src/components/ui';

export interface VendoredMaterial {
	copyright: string;
	includedPaths: string[];
	licenseFile: string;
	licenseText: string;
	localModificationPolicy: string;
	name: string;
	sourceUrl: string;
	spdx: string;
	upstreamRevision: string;
}

type StoredMaterial = Omit<VendoredMaterial, 'licenseText'>;

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`${RECORD_PATH}: ${field} must be a non-empty string.`);
	}
	return value;
}

function parseMaterial(value: unknown, index: number): StoredMaterial {
	if (value === null || typeof value !== 'object') {
		throw new Error(`${RECORD_PATH}: materials[${String(index)}] must be an object.`);
	}
	const row = value as Record<string, unknown>;
	if (!Array.isArray(row.includedPaths) || row.includedPaths.length === 0) {
		throw new Error(`${RECORD_PATH}: materials[${String(index)}].includedPaths is required.`);
	}
	const includedPaths = row.includedPaths.map((path, pathIndex) =>
		requireString(path, `materials[${String(index)}].includedPaths[${String(pathIndex)}]`),
	);
	const material = {
		copyright: requireString(row.copyright, `materials[${String(index)}].copyright`),
		includedPaths: [...new Set(includedPaths)].sort(byCodepoint),
		licenseFile: requireString(row.licenseFile, `materials[${String(index)}].licenseFile`),
		localModificationPolicy: requireString(
			row.localModificationPolicy,
			`materials[${String(index)}].localModificationPolicy`,
		),
		name: requireString(row.name, `materials[${String(index)}].name`),
		sourceUrl: requireString(row.sourceUrl, `materials[${String(index)}].sourceUrl`),
		spdx: requireString(row.spdx, `materials[${String(index)}].spdx`),
		upstreamRevision: requireString(
			row.upstreamRevision,
			`materials[${String(index)}].upstreamRevision`,
		),
	};
	if (!/^[0-9a-f]{40}$/.test(material.upstreamRevision)) {
		throw new Error(
			`${RECORD_PATH}: upstreamRevision must be a full lowercase Git commit SHA.`,
		);
	}
	if (!material.sourceUrl.includes(material.upstreamRevision)) {
		throw new Error(`${RECORD_PATH}: sourceUrl must pin the recorded upstreamRevision.`);
	}
	return material;
}

async function shadcnFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const glob = new Bun.Glob('**/*.tsx');
	for await (const file of glob.scan({ cwd: join(root, SHADCN_ROOT), onlyFiles: true })) {
		files.push(`${SHADCN_ROOT}/${file.replaceAll('\\', '/')}`);
	}
	return files.sort(byCodepoint);
}

function assertShadcnCoverage(materials: StoredMaterial[], actual: string[]): void {
	const recorded = materials
		.filter((material) => material.name === 'shadcn/ui')
		.flatMap((material) => material.includedPaths)
		.sort(byCodepoint);
	const added = actual.filter((path) => !recorded.includes(path));
	const removed = recorded.filter((path) => !actual.includes(path));
	if (added.length === 0 && removed.length === 0) return;
	throw new Error(
		`${RECORD_PATH}: shadcn/ui path inventory drifted. ` +
			`Added: ${added.join(', ') || 'none'}. Removed: ${removed.join(', ') || 'none'}.`,
	);
}

export async function collectVendoredMaterials(root: string): Promise<VendoredMaterial[]> {
	const raw = (await Bun.file(join(root, RECORD_PATH)).json()) as { materials?: unknown };
	if (!Array.isArray(raw.materials)) {
		throw new Error(`${RECORD_PATH}: materials must be an array.`);
	}
	const materials = raw.materials.map(parseMaterial);
	assertShadcnCoverage(materials, await shadcnFiles(root));
	return await Promise.all(
		materials.map(async (material) => ({
			...material,
			licenseText: requireString(
				await Bun.file(join(root, material.licenseFile)).text(),
				`${material.licenseFile} contents`,
			),
		})),
	);
}
