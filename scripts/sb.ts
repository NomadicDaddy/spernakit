#!/usr/bin/env bun
/**
 * sb — spernakit-browser CLI entry point.
 *
 * Thin client that parses command-line arguments and delegates to the
 * spernakit-browser daemon. The daemon is auto-started on first use.
 *
 * Usage:
 *   sb open <url>                     Navigate to URL
 *   sb snapshot -i                    Snapshot interactive elements
 *   sb click @e3                      Click element by ref
 *   sb fill @e3 "text"               Clear and fill text field
 *   sb type @e3 "text"               Type without clearing
 *   sb select @e3 "option"           Select dropdown option
 *   sb check @e3                      Toggle checkbox/switch
 *   sb press Enter                    Press keyboard key
 *   sb scroll down 500               Scroll page
 *   sb screenshot [path] [--full]    Take screenshot
 *   sb file-upload <@eN|sel> <path>  Attach file(s) to a file input
 *   sb wait --load networkidle       Wait for network idle
 *   sb wait @e3                       Wait for element
 *   sb wait --url "pattern"          Wait for URL pattern
 *   sb wait --text "text"            Wait for text to appear
 *   sb wait --fn "expr"              Wait for JS condition
 *   sb wait 2000                      Wait milliseconds
 *   sb get url                        Get current URL
 *   sb get text @e3                   Get element text
 *   sb get title                      Get page title
 *   sb set viewport 1440 900         Set viewport size
 *   sb console                        Show console entries
 *   sb errors                         Show errors
 *   sb clear                          Clear error buffers
 *   sb close                          Close session
 *   sb --session <name> <command>    Use named session
 */
import path from 'node:path';

import type { IpcRequest } from './spernakit-browser/types';

import { executeCommand } from './spernakit-browser/client';

// ---------------------------------------------------------------------------
// Git Bash MSYS2 path mangling fix (from crawltest-config.ts)
// ---------------------------------------------------------------------------

function stripMsysPath(val: string): string {
	const msys = val.match(/^[A-Z]:\/Program Files\/Git\/(.*)/i);
	return msys ? `/${msys[1]}` : val;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { args: string[]; command: string; session: string } {
	// Strip "bun", "run", script path from argv
	const raw = argv.slice(2);

	let session = 'default';
	const filtered: string[] = [];

	for (let i = 0; i < raw.length; i++) {
		const arg = raw[i];
		if (arg === '--session') {
			session = raw[++i] ?? 'default';
		} else if (arg) {
			filtered.push(arg);
		}
	}

	const command = filtered[0];
	if (!command) {
		printUsage();
		process.exit(1);
	}

	// Commands where a file path argument should be resolved to absolute
	const pathCommands = new Set(['screenshot', 'file-upload']);

	// Process remaining args: strip quotes, fix MSYS paths, resolve file paths
	const args = filtered.slice(1).map((a, i) => {
		// Remove surrounding quotes if present
		const unquoted = a.replace(/^["']|["']$/g, '');
		const fixed = stripMsysPath(unquoted);

		if (!pathCommands.has(command) || fixed.startsWith('--') || fixed.startsWith('@')) {
			return fixed;
		}

		// file-upload: args after the target (index 0) are always file paths,
		// so resolve them against CWD even if they're a bare filename.
		if (command === 'file-upload' && i >= 1) {
			return path.resolve(fixed);
		}

		// screenshot: only resolve if the arg looks file-like
		if (
			fixed.includes('/') ||
			fixed.includes('\\') ||
			fixed.endsWith('.png') ||
			fixed.endsWith('.jpg')
		) {
			return path.resolve(fixed);
		}

		return fixed;
	});

	return { args, command, session };
}

function printUsage(): void {
	console.log('Usage: sb [--session <name>] <command> [args...]');
	console.log('');
	console.log('Commands:');
	console.log('  open <url>                Navigate to URL');
	console.log('  snapshot -i               Snapshot interactive elements');
	console.log('  click @eN                 Click element by ref');
	console.log('  fill @eN "text"           Clear and fill text field');
	console.log('  type @eN "text"           Type without clearing');
	console.log('  select @eN "option"       Select dropdown option');
	console.log('  check @eN                 Toggle checkbox/switch');
	console.log('  press <Key>               Press keyboard key');
	console.log('  scroll <dir> <px>         Scroll page');
	console.log('  screenshot [path]         Take screenshot');
	console.log('  file-upload <@eN|sel> <path>  Attach file(s) to file input');
	console.log('  wait <target>             Wait for element/condition');
	console.log('  get url|text|title        Get page info');
	console.log('  set viewport <w> <h>      Set viewport size');
	console.log('  console                   Show console entries');
	console.log('  errors                    Show errors');
	console.log('  clear                     Clear error buffers');
	console.log('  close                     Close session');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const { args, command, session } = parseArgs(process.argv);

	const request: IpcRequest = { args, command, session };

	try {
		const response = await executeCommand(request);

		if (response.output) {
			console.log(response.output);
		}

		if (!response.ok) {
			if (response.error) {
				console.error(response.error);
			}
			process.exit(1);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`sb: ${msg}`);
		process.exit(1);
	}
}

main();
