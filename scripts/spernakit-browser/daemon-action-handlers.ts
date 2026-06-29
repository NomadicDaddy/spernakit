/**
 * Element interaction and wait command handlers for the daemon dispatch.
 *
 * Covers ref-based element actions (click/fill/type/select/check/press/scroll/
 * file-upload), page queries (get url/text/title), and wait conditions.
 * Returns null for commands this module does not handle.
 */
import type { IpcResponse } from './types.ts';

import {
	checkElement,
	clickElement,
	fillElement,
	getText,
	getUrl,
	pressKey,
	scroll,
	selectOption,
	typeElement,
	uploadFile,
} from './actions.ts';
import { sessions } from './daemon-sessions.ts';
import {
	waitForElement,
	waitForFunction,
	waitForLoad,
	waitForText,
	waitForUrl,
	waitMs,
} from './wait.ts';

export async function handleActionCommand(
	command: string,
	args: string[],
	sessionName: string
): Promise<IpcResponse | null> {
	switch (command) {
		case 'check': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };
			const refStr = args[0];
			if (!refStr) return { error: 'Usage: sb check @eN', ok: false };
			const output = await checkElement(sess.page, sess.state.refs, refStr);
			return { ok: !output.startsWith('Error'), output };
		}

		case 'click': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };
			const refStr = args[0];
			if (!refStr) return { error: 'Usage: sb click @eN', ok: false };
			const output = await clickElement(sess.page, sess.state.refs, refStr);
			sess.state.currentUrl = sess.page.url();
			return { ok: !output.startsWith('Error'), output };
		}

		case 'file-upload': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };
			const [target, ...filePaths] = args;
			if (!target || filePaths.length === 0) {
				return {
					error: 'Usage: sb file-upload <@eN|selector> <path> [path...]',
					ok: false,
				};
			}
			const output = await uploadFile(sess.page, sess.state.refs, target, filePaths);
			return { ok: !output.startsWith('Error'), output };
		}

		case 'fill': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };
			const [refStr, ...textParts] = args;
			const text = textParts.join(' ');
			if (!refStr || !text) return { error: 'Usage: sb fill @eN "text"', ok: false };
			const output = await fillElement(sess.page, sess.state.refs, refStr, text);
			return { ok: !output.startsWith('Error'), output };
		}

		case 'get': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };
			const subcommand = args[0];

			if (subcommand === 'url') {
				return { ok: true, output: getUrl(sess.page) };
			}
			if (subcommand === 'text') {
				const refStr = args[1];
				if (!refStr) return { error: 'Usage: sb get text @eN', ok: false };
				const output = await getText(sess.page, sess.state.refs, refStr);
				return { ok: !output.startsWith('Error'), output };
			}
			if (subcommand === 'title') {
				const title = await sess.page.title();
				return { ok: true, output: title };
			}
			return { error: `Unknown get subcommand: ${subcommand}`, ok: false };
		}

		case 'press': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };
			const key = args[0];
			if (!key) return { error: 'Usage: sb press <Key>', ok: false };
			const output = await pressKey(sess.page, key);
			return { ok: true, output };
		}

		case 'scroll': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };
			const direction = args[0] as 'down' | 'up';
			const pixels = parseInt(args[1] ?? '500', 10);
			const selectorIdx = args.indexOf('--selector');
			const selector = selectorIdx >= 0 ? args[selectorIdx + 1] : undefined;
			const output = await scroll(sess.page, direction || 'down', pixels, selector);
			return { ok: true, output };
		}

		case 'select': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };
			const [refStr, ...optParts] = args;
			const optionText = optParts.join(' ');
			if (!refStr || !optionText)
				return { error: 'Usage: sb select @eN "option"', ok: false };
			const output = await selectOption(sess.page, sess.state.refs, refStr, optionText);
			return { ok: !output.startsWith('Error'), output };
		}

		case 'type': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };
			const [refStr, ...textParts] = args;
			const text = textParts.join(' ');
			if (!refStr || !text) return { error: 'Usage: sb type @eN "text"', ok: false };
			const output = await typeElement(sess.page, sess.state.refs, refStr, text);
			return { ok: !output.startsWith('Error'), output };
		}

		case 'wait': {
			const sess = sessions.get(sessionName);
			if (!sess) return { error: 'No active session', ok: false };

			if (args.includes('--load')) {
				const event = args[args.indexOf('--load') + 1] ?? 'networkidle';
				const output = await waitForLoad(sess.page, event as 'networkidle');
				return { ok: true, output };
			}
			if (args.includes('--url')) {
				const pattern = args[args.indexOf('--url') + 1];
				if (!pattern) return { error: 'Usage: sb wait --url "pattern"', ok: false };
				const output = await waitForUrl(sess.page, pattern);
				return { ok: true, output };
			}
			if (args.includes('--text')) {
				const text = args[args.indexOf('--text') + 1];
				if (!text) return { error: 'Usage: sb wait --text "text"', ok: false };
				const output = await waitForText(sess.page, text);
				return { ok: true, output };
			}
			if (args.includes('--fn')) {
				const expr = args[args.indexOf('--fn') + 1];
				if (!expr) return { error: 'Usage: sb wait --fn "expression"', ok: false };
				const output = await waitForFunction(sess.page, expr);
				return { ok: true, output };
			}
			// Wait for element or milliseconds
			const target = args[0];
			if (!target) return { error: 'Usage: sb wait <@ref|selector|ms>', ok: false };

			const ms = parseInt(target, 10);
			if (!isNaN(ms) && String(ms) === target) {
				const output = await waitMs(ms);
				return { ok: true, output };
			}

			const stateIdx = args.indexOf('--state');
			const stateVal = stateIdx >= 0 ? args[stateIdx + 1] : undefined;
			const waitOpts: { state?: 'hidden' | 'visible' } = {};
			if (stateVal === 'hidden' || stateVal === 'visible') waitOpts.state = stateVal;
			const output = await waitForElement(sess.page, sess.state.refs, target, waitOpts);
			return { ok: true, output };
		}

		default:
			return null;
	}
}
