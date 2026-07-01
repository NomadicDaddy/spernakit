/**
 * Command dispatch for the spernakit-browser daemon.
 *
 * Handles session lifecycle and diagnostics commands directly and delegates
 * element interaction / wait / query commands to daemon-action-handlers.
 */
import type { IpcRequest, IpcResponse } from './types.ts';

import { clearBuffers, getConsoleEntries, getNetworkErrors, setViewport } from './browser.ts';
import { handleActionCommand } from './daemon-action-handlers.ts';
import { closeSession, getOrCreateSession, sessions } from './daemon-sessions.ts';
import { takeScreenshot } from './screenshot.ts';
import { takeSnapshot } from './snapshot.ts';

export async function handleCommand(
	req: IpcRequest,
	shutdown: () => Promise<void>
): Promise<IpcResponse> {
	const { args, command, session: sessionName } = req;

	try {
		switch (command) {
			case 'clear': {
				const sess = sessions.get(sessionName);
				if (!sess) return { error: 'No active session', ok: false };
				clearBuffers(sess.state);
				return { ok: true, output: 'Buffers cleared' };
			}

			case 'close': {
				await closeSession(sessionName);
				// If no sessions remain, shut down the daemon
				if (sessions.size === 0) {
					// Delay shutdown slightly to send the response first
					setTimeout(() => shutdown(), 100);
				}
				return { ok: true, output: 'Session closed' };
			}

			case 'console': {
				const sess = sessions.get(sessionName);
				if (!sess) return { error: 'No active session', ok: false };
				const entries = getConsoleEntries(sess.state);
				if (entries.length === 0) return { ok: true, output: 'No console entries' };
				const lines = entries.map((e) => `[${e.level}] ${e.text} (${e.url})`);
				return { ok: true, output: lines.join('\n') };
			}

			case 'errors': {
				const sess = sessions.get(sessionName);
				if (!sess) return { error: 'No active session', ok: false };
				const consoleErrors = getConsoleEntries(sess.state, 'error');
				const networkErrors = getNetworkErrors(sess.state);

				const lines: string[] = [];
				if (consoleErrors.length > 0) {
					lines.push('Console errors:');
					for (const e of consoleErrors) {
						lines.push(`  ${e.text} (${e.url})`);
					}
				}
				if (networkErrors.length > 0) {
					lines.push('Network errors:');
					for (const e of networkErrors) {
						lines.push(`  ${e.status} ${e.statusText}: ${e.url}`);
					}
				}
				if (lines.length === 0) return { ok: true, output: 'No errors' };
				return { ok: true, output: lines.join('\n') };
			}

			case 'open': {
				const url = args[0];
				if (!url) return { error: 'Usage: sb open <url>', ok: false };
				const sess = await getOrCreateSession(sessionName);
				await sess.page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
				sess.state.currentUrl = sess.page.url();
				return { ok: true, output: `Navigated to ${sess.state.currentUrl}` };
			}

			case 'ping': {
				return { ok: true, output: 'pong' };
			}

			case 'screenshot': {
				const sess = sessions.get(sessionName);
				if (!sess) return { error: 'No active session', ok: false };
				const fullPage = args.includes('--full');
				// Find path (first arg that doesn't start with --)
				const outputPath = args.find((a) => !a.startsWith('--'));
				const output = await takeScreenshot(sess.page, outputPath, { fullPage });
				return { ok: !output.startsWith('Error'), output };
			}

			case 'set': {
				const sess = sessions.get(sessionName);
				if (!sess) return { error: 'No active session', ok: false };
				const subcommand = args[0];

				if (subcommand === 'viewport') {
					const w = parseInt(args[1] ?? '', 10);
					const h = parseInt(args[2] ?? '', 10);
					if (isNaN(w) || isNaN(h))
						return { error: 'Usage: sb set viewport <width> <height>', ok: false };
					await setViewport(sess, w, h);
					return { ok: true, output: `Viewport set to ${w}x${h}` };
				}
				return { error: `Unknown set subcommand: ${subcommand}`, ok: false };
			}

			case 'shutdown': {
				setTimeout(() => shutdown(), 100);
				return { ok: true, output: 'Daemon shutting down' };
			}

			case 'snapshot': {
				const sess = sessions.get(sessionName);
				if (!sess)
					return { error: 'No active session. Use "sb open <url>" first.', ok: false };
				const interactive = args.includes('-i');
				const result = await takeSnapshot(sess.page, interactive);
				sess.state.refs = result.refs;
				sess.state.currentUrl = result.url;
				return { ok: true, output: result.text };
			}
		}

		const actionResponse = await handleActionCommand(command, args, sessionName);
		if (actionResponse) return actionResponse;

		return { error: `Unknown command: ${command}`, ok: false };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { error: msg, ok: false };
	}
}
