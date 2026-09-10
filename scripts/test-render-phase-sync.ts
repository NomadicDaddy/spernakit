#!/usr/bin/env bun
/**
 * Regression coverage for a render-phase state sync that defeats its own guard.
 *
 * The defect this gate was written for: the Edit Workspace dialog seeded its form during render
 * behind `if (workspace && form.name !== workspace.name)`. The condition read the very field the
 * user types into, so the first keystroke made it true and the block typed the old name straight
 * back. The Name input could not hold anything but the workspace's current name, and Save then
 * sent that unchanged name, so the save reported success and nothing appeared to change. Four
 * applications reported one face of it or another, and Description, which was not in the
 * condition, accepted input the whole time.
 *
 * The property under test is the shape rather than the one dialog. Adjusting state during render
 * is a pattern React supports and the template uses on purpose in six other places; it is only
 * safe when the guard compares against a sentinel nothing but the guard writes. This gate reads
 * every frontend source, finds each component-body guard that resets state, and fails when the
 * state it compares against is also written somewhere else in the file, because whatever writes
 * it can make the guard true again and undo the user's work.
 *
 * Runs in process, over the tracked frontend sources. The synthetic fixtures below prove the scan
 * still fails on the original shape and still passes the sentinel one, so a scan that quietly
 * stopped matching cannot report green.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findSelfDefeatingSyncs } from './lib/render-phase-sync.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** The original shape: the guard reads the field the user edits, so typing re-arms it. */
const SELF_DEFEATING = `import { useState } from 'react';

export function EditThing({ thing }: { thing: { name: string } }) {
	const [form, setForm] = useState({ name: '' });

	if (thing && form.name !== thing.name) {
		setForm({ name: thing.name });
	}

	function handleChange(value: string) {
		setForm({ name: value });
	}

	return <input onChange={(e) => handleChange(e.target.value)} value={form.name} />;
}
`;

/** The sentinel shape: the guard reads state nothing else writes, so typing cannot re-arm it. */
const SENTINEL = `import { useState } from 'react';

export function EditThing({ thing }: { thing: { id: number; name: string } }) {
	const [form, setForm] = useState({ name: '' });
	const [seededFor, setSeededFor] = useState<null | number>(null);

	if (thing.id !== seededFor) {
		setSeededFor(thing.id);
		setForm({ name: thing.name });
	}

	function handleChange(value: string) {
		setForm({ name: value });
	}

	return <input onChange={(e) => handleChange(e.target.value)} value={form.name} />;
}
`;

/** The scan still recognises the shape it was written for, and still clears the correct one. */
function scanStillWorks(): void {
	const dir = mkdtempSync(join(tmpdir(), 'spernakit-render-sync-'));
	try {
		const bad = join(dir, 'SelfDefeating.tsx');
		const good = join(dir, 'Sentinel.tsx');
		writeFileSync(bad, SELF_DEFEATING);
		writeFileSync(good, SENTINEL);

		const found = findSelfDefeatingSyncs(dir, [bad, good]);
		assert(
			found.length === 1 && found[0]?.path === 'SelfDefeating.tsx',
			`the scan must report the self-defeating fixture and only it, it reported ${
				found.map((o) => o.path).join(', ') || 'nothing'
			}`,
		);
		assert(
			found[0]?.guardedOn === 'form',
			`the scan must name the state the guard compares against, it named ${String(found[0]?.guardedOn)}`,
		);
	} finally {
		rmSync(dir, { force: true, recursive: true });
	}
}

/** No component in the template guards a render-phase reset on state the user can change. */
function templateIsClean(): void {
	const root = join(repoRoot, 'frontend', 'src');
	const files = readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /[.]tsx?$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name));
	assert(files.length > 0, 'the scan found no frontend sources to read, which cannot be right');

	const offenders = findSelfDefeatingSyncs(repoRoot, files);
	assert(
		offenders.length === 0,
		`a render-phase reset must be guarded by state nothing else writes, or typing undoes it: ${offenders
			.map(
				(o) => `${o.path}:${String(o.line)} resets ${o.resets} but compares ${o.guardedOn}`,
			)
			.join('; ')}`,
	);
}

scanStillWorks();
templateIsClean();

if (failures.length === 0) {
	console.log('[OK] render-phase-sync: a render-phase reset cannot be re-armed by typing');
	process.exit(0);
}
console.error('[FAIL] render-phase-sync:');
for (const failure of failures) console.error(' -', failure);
process.exit(1);
