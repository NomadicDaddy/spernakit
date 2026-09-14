import { loadJsonConfig } from '../load-json-config.ts';
import {
	log,
	logError,
	logSuccess,
	probeCompression,
	staticDeliveryFindings,
} from './compression-probe.ts';

function assetPaths(html: string): { css?: string; javascript?: string } {
	const css = html.match(/<link[^>]+href=["']([^"']+\.css)["']/i)?.[1];
	const javascript = html.match(/<script[^>]+src=["']([^"']+\.js)["']/i)?.[1];
	return { ...(css ? { css } : {}), ...(javascript ? { javascript } : {}) };
}

/** Exercise nginx's SPA, immutable asset, media-type, compression, and source-map policies. */
async function testStaticDelivery(root: string, mode: string): Promise<boolean> {
	if (mode === 'dev') return true;
	log('\n=== Testing Nginx Static Delivery ===\n', 'blue');
	const { config } = loadJsonConfig(root);
	const frontendUrl = config.server?.frontendUrl;
	if (!frontendUrl) return false;
	const html = await probeCompression(new URL('/', frontendUrl));
	if (!html.reachable || html.status !== 200) return false;
	const paths = assetPaths(html.body.toString('utf8'));
	if (!paths.javascript || !paths.css) {
		logError('Entry HTML did not name both a hashed JavaScript and CSS asset');
		return false;
	}
	const [javascript, css, sourceMap] = await Promise.all([
		probeCompression(new URL(paths.javascript, frontendUrl)),
		probeCompression(new URL(paths.css, frontendUrl)),
		probeCompression(new URL(`${paths.javascript}.map`, frontendUrl)),
	]);
	if (!javascript.reachable || !css.reachable || !sourceMap.reachable) return false;
	const results = [
		['SPA HTML media/cache/compression policy', staticDeliveryFindings('html', html)],
		[
			'hashed JavaScript media/cache/compression policy',
			staticDeliveryFindings('javascript', javascript),
		],
		['hashed CSS media/cache/compression policy', staticDeliveryFindings('css', css)],
		['source-map denial policy', staticDeliveryFindings('source-map', sourceMap)],
	] as const;
	for (const [label, findings] of results) {
		if (findings.length === 0) logSuccess(label);
		else logError(`${label}: ${findings.join(', ')}`);
	}
	return results.every(([, findings]) => findings.length === 0);
}

export { testStaticDelivery };
