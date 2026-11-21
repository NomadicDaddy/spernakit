/**
 * The parser for `.aidd/regression-suite.md`, the checked-in never-break suite.
 *
 * The file is ordinary Markdown so people can read it. Each case is a `## TC-NNN: title` heading
 * followed by exactly one fenced block whose info string is `tc`. The block is JSON, and it is the
 * executable contract; the prose around it is for people. A suite is five to ten cases, numbered
 * from TC-001 with no gaps, so dropping a flow means deleting its entry where review can see it.
 *
 * A block's JSON is `{ "role": "<seeded role>", "steps": [ ... ] }`, and each step is an object with
 * exactly one action key:
 *
 *   { "goto": "/path" }                         same-origin path only, starting with a single `/`
 *   { "signIn": true }                          sign in as the case's role
 *   { "click": <selector> }
 *   { "fill": <selector>, "value": "text" }     `${runId}` in the value is the run's unique id
 *   { "expectUrl": "/path" }
 *   { "expectText": "text" }                    `${runId}` allowed
 *   { "expectSelector": <selector> }
 *   { "restartBackend": true }                  only after a click or fill in the same case
 *
 * A selector is `{ "testId": "..." }` or `{ "role": "...", "name": "..." }`, never CSS or XPath, so
 * a flow survives restyling. Anything else is refused with the case and step it is in: an unknown
 * key, a case with no expect step, a commented-out block, a heading without a block or a block
 * without a heading.
 */

export type Selector = { name: string; role: string } | { testId: string };

export type Step =
	| { click: Selector }
	| { expectSelector: Selector }
	| { expectText: string }
	| { expectUrl: string }
	| { fill: Selector; value: string }
	| { goto: string }
	| { restartBackend: true }
	| { signIn: true };

export interface TestCase {
	id: string;
	role: string;
	steps: Step[];
	title: string;
}

export const MIN_CASES = 5;
export const MAX_CASES = 10;

const HEADING = /^##\s+(TC-\d{3}):\s*(\S.*)$/u;
const FENCE_OPEN = /^```tc\s*$/u;
const FENCE_CLOSE = /^```\s*$/u;
const ANY_TC_FENCE = /```tc\b/u;

/** One problem with the suite, located well enough to fix without reading the parser. */
export class SuiteError extends Error {}

function fail(message: string): never {
	throw new SuiteError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asSelector(raw: unknown, where: string): Selector {
	if (!isRecord(raw)) fail(`${where}: a selector must be an object.`);
	const keys = Object.keys(raw).sort().join(',');
	if (keys === 'testId' && typeof raw.testId === 'string' && raw.testId !== '') {
		return { testId: raw.testId };
	}
	if (
		keys === 'name,role' &&
		typeof raw.role === 'string' &&
		raw.role !== '' &&
		typeof raw.name === 'string' &&
		raw.name !== ''
	) {
		return { name: raw.name, role: raw.role };
	}
	return fail(`${where}: a selector is { "testId" } or { "role", "name" }, nothing else.`);
}

/** A same-origin path: one leading slash, never `//host`, a scheme or a backslash. */
function asPath(raw: unknown, where: string): string {
	if (
		typeof raw !== 'string' ||
		!raw.startsWith('/') ||
		raw.startsWith('//') ||
		raw.includes('\\')
	) {
		fail(`${where}: a path must be same-origin and start with a single "/".`);
	}
	return raw;
}

function asText(raw: unknown, where: string): string {
	if (typeof raw !== 'string' || raw === '') fail(`${where}: expected non-empty text.`);
	return raw;
}

function asStep(raw: unknown, where: string): Step {
	if (!isRecord(raw)) fail(`${where}: a step must be an object.`);
	const keys = Object.keys(raw);
	if ('fill' in raw) {
		if (keys.sort().join(',') !== 'fill,value') fail(`${where}: fill takes exactly "value".`);
		return { fill: asSelector(raw.fill, where), value: asText(raw.value, where) };
	}
	if (keys.length !== 1) fail(`${where}: a step has exactly one action key.`);
	const [action] = keys;
	const value = raw[action as string];
	switch (action) {
		case 'click':
			return { click: asSelector(value, where) };
		case 'expectSelector':
			return { expectSelector: asSelector(value, where) };
		case 'expectText':
			return { expectText: asText(value, where) };
		case 'expectUrl':
			return { expectUrl: asPath(value, where) };
		case 'goto':
			return { goto: asPath(value, where) };
		case 'restartBackend':
		case 'signIn':
			if (value !== true) fail(`${where}: ${action} takes true.`);
			return action === 'signIn' ? { signIn: true } : { restartBackend: true };
		default:
			return fail(`${where}: unknown step "${String(action)}".`);
	}
}

function asCase(id: string, title: string, json: string, where: string): TestCase {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch (err) {
		fail(
			`${where}: the tc block is not JSON (${err instanceof Error ? err.message : String(err)}).`,
		);
	}
	if (!isRecord(raw) || Object.keys(raw).sort().join(',') !== 'role,steps') {
		fail(`${where}: the tc block is { "role", "steps" }.`);
	}
	const role = asText(raw.role, `${where} role`);
	if (!Array.isArray(raw.steps) || raw.steps.length === 0)
		fail(`${where}: steps must be a list.`);
	const steps = raw.steps.map((step, index) =>
		asStep(step, `${where} step ${String(index + 1)}`),
	);
	if (
		!steps.some(
			(step) => 'expectUrl' in step || 'expectText' in step || 'expectSelector' in step,
		)
	) {
		fail(`${where}: a case needs at least one expect step, or it can never fail.`);
	}
	let wrote = false;
	for (const [index, step] of steps.entries()) {
		if ('click' in step || 'fill' in step) wrote = true;
		if ('restartBackend' in step && !wrote) {
			fail(
				`${where} step ${String(index + 1)}: restartBackend needs a click or fill before it.`,
			);
		}
	}
	return { id, role, steps, title };
}

/** Parse the suite text. Throws SuiteError naming the first problem. */
export function parseSuite(text: string): TestCase[] {
	const lines = text.split(/\r?\n/u);
	// A commented-out case is the one way to weaken the suite without deleting an entry.
	const comment = /<!--[\s\S]*?-->/gu;
	for (const match of text.matchAll(comment)) {
		if (ANY_TC_FENCE.test(match[0]))
			fail('A tc block is inside an HTML comment. Delete the case instead.');
	}
	const cases: TestCase[] = [];
	let heading: { id: string; line: number; title: string } | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const head = HEADING.exec(line);
		if (head?.[1] !== undefined && head[2] !== undefined) {
			if (heading) fail(`${heading.id} (line ${String(heading.line)}) has no tc block.`);
			heading = { id: head[1], line: i + 1, title: head[2].trim() };
			continue;
		}
		if (!FENCE_OPEN.test(line)) continue;
		if (!heading)
			fail(`The tc block at line ${String(i + 1)} has no "## TC-NNN: title" heading.`);
		const body: string[] = [];
		let j = i + 1;
		for (; j < lines.length && !FENCE_CLOSE.test(lines[j] ?? ''); j++)
			body.push(lines[j] ?? '');
		if (j >= lines.length) fail(`${heading.id}: its tc block is never closed.`);
		cases.push(asCase(heading.id, heading.title, body.join('\n'), heading.id));
		heading = null;
		i = j;
	}
	if (heading) fail(`${heading.id} (line ${String(heading.line)}) has no tc block.`);
	for (const [index, testCase] of cases.entries()) {
		const expected = `TC-${String(index + 1).padStart(3, '0')}`;
		if (testCase.id !== expected)
			fail(
				`Cases must run TC-001 upward with no gaps: found ${testCase.id} where ${expected} belongs.`,
			);
	}
	if (cases.length < MIN_CASES || cases.length > MAX_CASES) {
		fail(
			`The suite has ${String(cases.length)} case(s); it must have ${String(MIN_CASES)} to ${String(MAX_CASES)}.`,
		);
	}
	return cases;
}

/** Replace the one allowed token, `${runId}`, in a fill value or expected text. */
export function withRunId(text: string, runId: string): string {
	return text.replaceAll('${runId}', runId);
}
