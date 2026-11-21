/**
 * The detector-level assertions of test-template-deletions.ts: behaviour the CLI fixture cannot
 * isolate. Kept apart so the test stays under the line cap; the assertions are unchanged and
 * counted through the caller's assert.
 */
import { detectRetainedDeletions, findRemovedPaths, type RetainedDeletion } from './deletions.ts';
import { printRetainedDeletions } from './report.ts';
import { type TemplateOverrides } from './types.ts';

const noOverrides = (): TemplateOverrides => ({
	deleted: new Map(),
	keep: new Map(),
	skip: new Map(),
});

export function checkDeletionDetectorUnits(
	assert: (condition: boolean, message: string) => void,
): void {
	// findRemovedPaths is the set the drift report is filtered by, so it must include a removed path
	// the app has ALREADY dropped — otherwise deleting the file would resurrect it as a missing-file
	// failure, which is exactly the contradiction assertion 7 guards end-to-end.
	const removedRegardless = findRemovedPaths({
		recordedPaths: ['gone.ts', 'kept.ts'],
		targetPaths: ['kept.ts'],
	});
	assert(
		removedRegardless.has('gone.ts') && !removedRegardless.has('kept.ts'),
		'findRemovedPaths must classify by the two template versions alone, not by app contents',
	);
	assert(
		detectRetainedDeletions({
			existsInApp: () => false,
			overrides: noOverrides(),
			recordedPaths: ['gone.ts'],
			targetPaths: [],
		}).length === 0,
		'A removed path the app no longer carries must not be reported',
	);
	// Duplicate candidates collapse, and output is deterministically ordered.
	const ordered = detectRetainedDeletions({
		existsInApp: () => true,
		overrides: noOverrides(),
		recordedPaths: ['b.ts', 'a.ts', 'b.ts'],
		targetPaths: [],
	});
	assert(
		ordered.length === 2 && ordered[0]?.filePath === 'a.ts',
		'Deletions must be de-duplicated and sorted for a stable report',
	);
	// An empty DELETED reason is still a suppression — the operator acknowledged the path.
	const emptyReason = detectRetainedDeletions({
		existsInApp: () => true,
		overrides: { ...noOverrides(), deleted: new Map([['a.ts', '']]) },
		recordedPaths: ['a.ts'],
		targetPaths: [],
	});
	assert(
		emptyReason[0]?.status === 'suppressed',
		'A DELETED line with no reason must still suppress the retention',
	);

	const captureReport = (deletions: RetainedDeletion[]): string => {
		const lines: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			lines.push(args.map(String).join(' '));
		};
		try {
			printRetainedDeletions(deletions, '3.47.6', '3.48.0', true);
		} finally {
			console.log = originalLog;
		}
		return lines.join('\n');
	};
	const plainReport = captureReport([{ filePath: 'site/og.png', status: 'retained' }]);
	assert(
		plainReport.includes('Delete these files') && plainReport.includes('site/og.png'),
		'Retained template deletions must name the file and the operator remedy',
	);
}
