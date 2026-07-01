/**
 * Session registry for the spernakit-browser daemon.
 *
 * Holds active browser sessions in memory, keyed by session name.
 */
import type { BrowserSession } from './browser.ts';

import { closeBrowser, launchBrowser } from './browser.ts';

export const sessions = new Map<string, BrowserSession>();

export async function getOrCreateSession(sessionName: string): Promise<BrowserSession> {
	let session = sessions.get(sessionName);
	if (!session) {
		session = await launchBrowser(sessionName);
		sessions.set(sessionName, session);
	}
	return session;
}

export async function closeSession(sessionName: string): Promise<void> {
	const session = sessions.get(sessionName);
	if (session) {
		await closeBrowser(session);
		sessions.delete(sessionName);
	}
}

export async function closeAllSessions(): Promise<void> {
	for (const [name] of sessions) {
		await closeSession(name);
	}
}
