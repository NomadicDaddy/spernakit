import { existsSync, readFileSync } from 'node:fs';

interface JournalEntry {
	breakpoints: boolean;
	idx: number;
	tag: string;
	version: string;
	when: number;
}

interface DrizzleJournal {
	dialect: string;
	entries: JournalEntry[];
	version: string;
}

function readJournal(journalPath: string): DrizzleJournal | null {
	if (!existsSync(journalPath)) {
		return null;
	}
	try {
		return JSON.parse(readFileSync(journalPath, 'utf8')) as DrizzleJournal;
	} catch (err) {
		throw new Error(
			`Failed to parse migration journal at ${journalPath}: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err }
		);
	}
}

export { type DrizzleJournal, type JournalEntry, readJournal };
