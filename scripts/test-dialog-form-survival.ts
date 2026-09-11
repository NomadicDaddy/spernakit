#!/usr/bin/env bun
/**
 * Regression coverage for a dialog that throws away what the operator typed when the server says no.
 *
 * The defect this gate was written for: Settings > Users > Create User handed the form to
 * `onCreate` and cleared every field on the next line. `onCreate` starts a mutation and returns at
 * once, so the clearing happened whatever the server went on to answer. A username the API refused
 * left the dialog open, empty, with a toast that faded in a few seconds and nothing on any field
 * saying what was wrong. The operator had to retype the email and the password to find out whether
 * the username was the problem. Insert Row and the dashboard name dialog did the same thing, and
 * the dashboard one closed itself on the way out as well, so a refused rename took the name with it.
 *
 * The property under test is that a form outlives the request it was submitted with. Clearing is
 * only correct once the answer is in, which in this codebase means after an awaited call or inside
 * a mutation's own `onSuccess`, or when the dialog opens again for a new record. The gate reads
 * every frontend source and fails on a handler that clears a rendered control and hands work off in
 * the same synchronous pass.
 *
 * `test:render-phase-sync` owns the other half of the same promise: that a form seeded during
 * render is not undone by the typing it is meant to leave alone. Between them, what somebody typed
 * survives until the dialog is done with it.
 *
 * Runs in process, over the tracked frontend sources. The synthetic fixtures below prove the scan
 * still fails on the original shape and still clears the two correct ones, so a scan that quietly
 * stopped matching cannot report green.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findEarlyFormResets } from './lib/dialog-form-survival.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** The original shape: the fields are cleared on the way out of the submit, refusal or not. */
const CLEARS_ON_SUBMIT = `import { useState } from 'react';

export function CreateThing({ isOpen, onCreate, onOpenChange }: Props) {
	const [form, setForm] = useState({ name: '' });

	function handleSubmit() {
		onCreate(form);
		setForm({ name: '' });
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<input onChange={(e) => setForm({ name: e.target.value })} value={form.name} />
		</Dialog>
	);
}
`;

/** Awaiting the call is the answer arriving, so clearing after it clears a submission that landed. */
const CLEARS_AFTER_AWAIT = `import { useState } from 'react';

export function CreateThing({ isOpen, onCreate, onOpenChange }: Props) {
	const [form, setForm] = useState({ name: '' });

	const handleSubmit = async () => {
		await onCreate(form);
		setForm({ name: '' });
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<input onChange={(e) => setForm({ name: e.target.value })} value={form.name} />
		</Dialog>
	);
}
`;

/** Clearing when the dialog opens again is the sanctioned shape, and starts no request at all. */
const CLEARS_ON_OPEN = `import { useState } from 'react';

export function CreateThing({ isOpen, onCreate, onOpenChange }: Props) {
	const [form, setForm] = useState({ name: '' });
	const [openedFor, setOpenedFor] = useState(isOpen);

	if (isOpen !== openedFor) {
		setOpenedFor(isOpen);
		if (isOpen) setForm({ name: '' });
	}

	function handleSubmit() {
		onCreate(form);
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<input onChange={(e) => setForm({ name: e.target.value })} value={form.name} />
		</Dialog>
	);
}
`;

/** The scan still recognises the shape it was written for, and still clears the correct ones. */
function scanStillWorks(): void {
	const dir = mkdtempSync(join(tmpdir(), 'spernakit-dialog-form-'));
	try {
		const bad = join(dir, 'ClearsOnSubmit.tsx');
		const awaited = join(dir, 'ClearsAfterAwait.tsx');
		const onOpen = join(dir, 'ClearsOnOpen.tsx');
		writeFileSync(bad, CLEARS_ON_SUBMIT);
		writeFileSync(awaited, CLEARS_AFTER_AWAIT);
		writeFileSync(onOpen, CLEARS_ON_OPEN);

		const found = findEarlyFormResets(dir, [bad, awaited, onOpen]);
		assert(
			found.length === 1 && found[0]?.path === 'ClearsOnSubmit.tsx',
			`the scan must report the clearing fixture and only it, it reported ${
				found.map((o) => o.path).join(', ') || 'nothing'
			}`,
		);
		assert(
			found[0]?.name === 'handleSubmit' && found[0]?.clears === 'setForm',
			`the scan must name the handler and what it clears, it named ${String(found[0]?.name)} and ${String(found[0]?.clears)}`,
		);
	} finally {
		rmSync(dir, { force: true, recursive: true });
	}
}

/** No dialog in the template clears a rendered control before the submission has been answered. */
function templateIsClean(): void {
	const root = join(repoRoot, 'frontend', 'src');
	const files = readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /[.]tsx?$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name));
	assert(files.length > 0, 'the scan found no frontend sources to read, which cannot be right');

	const offenders = findEarlyFormResets(repoRoot, files);
	assert(
		offenders.length === 0,
		`a dialog must keep what was typed until the submission is answered: ${offenders
			.map((o) => `${o.path}:${String(o.line)} ${o.name} clears ${o.clears}`)
			.join('; ')}`,
	);
}

scanStillWorks();
templateIsClean();

if (failures.length === 0) {
	console.log('[OK] dialog-form-survival: a refused submission leaves the form as it was');
	process.exit(0);
}
console.error('[FAIL] dialog-form-survival:');
for (const failure of failures) console.error(' -', failure);
process.exit(1);
