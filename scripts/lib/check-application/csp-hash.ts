/**
 * CSP inline-script hash consistency check.
 *
 * Extracted from scripts/check-application.ts (max-lines split).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Compute the SHA-256 hash of the inline theme-init script in frontend/index.html
 * and verify it matches the CSP hashes in securityHeaders.ts and nginx.conf.
 *
 * This prevents the CSP hash from drifting when the inline script is modified,
 * which would cause all pages to fail with CSP violations in production/Docker.
 */
export function checkCspHashConsistency(repoRoot: string): void {
	console.log('   Checking CSP inline script hash consistency...');

	const indexHtmlPath = path.join(repoRoot, 'frontend', 'index.html');
	if (!fs.existsSync(indexHtmlPath)) {
		console.log('   Skipped (frontend/index.html not found).');
		return;
	}

	const html = fs.readFileSync(indexHtmlPath, 'utf8');
	const scriptMatch = html.match(/<script>[\s\S]*?<\/script>/);
	if (!scriptMatch) {
		console.log('   Skipped (no inline script found in index.html).');
		return;
	}

	// Extract content between <script> and </script>
	const contentMatch = scriptMatch[0].match(/<script>([\s\S]*?)<\/script>/);
	if (!contentMatch?.[1]) {
		console.log('   Skipped (empty inline script).');
		return;
	}

	const scriptContent = contentMatch[1];
	const actualHash = `sha256-${createHash('sha256').update(scriptContent).digest('base64')}`;

	// Check securityHeaders.ts
	const secHeadersPath = path.join(repoRoot, 'backend', 'src', 'plugins', 'securityHeaders.ts');
	if (fs.existsSync(secHeadersPath)) {
		const secHeaders = fs.readFileSync(secHeadersPath, 'utf8');
		const hashMatch = secHeaders.match(/sha256-[A-Za-z0-9+/]+=*/g);
		if (hashMatch && !hashMatch.includes(actualHash)) {
			throw new Error(
				`CSP hash mismatch in securityHeaders.ts.\n` +
					`     Inline script hash: ${actualHash}\n` +
					`     securityHeaders.ts has: ${hashMatch.join(', ')}\n` +
					`     Update the CSP hash in securityHeaders.ts to match.`
			);
		}
	}

	// Check nginx.conf
	const nginxConfPath = path.join(repoRoot, 'docker', 'nginx.conf');
	if (fs.existsSync(nginxConfPath)) {
		const nginxConf = fs.readFileSync(nginxConfPath, 'utf8');
		const hashMatch = nginxConf.match(/sha256-[A-Za-z0-9+/]+=*/g);
		if (hashMatch && !hashMatch.includes(actualHash)) {
			throw new Error(
				`CSP hash mismatch in docker/nginx.conf.\n` +
					`     Inline script hash: ${actualHash}\n` +
					`     nginx.conf has: ${hashMatch.join(', ')}\n` +
					`     Update the CSP hash in nginx.conf to match.`
			);
		}
	}

	console.log(`   CSP hash consistent: ${actualHash}`);
}
