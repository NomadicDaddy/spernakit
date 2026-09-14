const REQUIRED_HEADERS = [
	'add_header Cross-Origin-Opener-Policy same-origin always;',
	'add_header Cross-Origin-Resource-Policy same-origin always;',
] as const;
const FRONTEND_LOCATIONS = [
	'location = /50x.html',
	'location /assets/',
	'location @spa',
	'location / {',
	'location ~ /\\.',
	'location ~ \\.map$',
] as const;

type FrontendLocation = (typeof FRONTEND_LOCATIONS)[number];

function locationBody(config: string, location: FrontendLocation): string | undefined {
	const start = config.indexOf(location);
	if (start < 0) return undefined;
	const open = config.indexOf('{', start);
	const close = config.indexOf('\n        }', open);
	return open >= 0 && close >= 0 ? config.slice(open + 1, close) : undefined;
}

/** Return policy gaps; an empty result proves every frontend response block is aligned. */
function nginxSecurityFindings(config: string): string[] {
	const findings: string[] = [];
	for (const location of FRONTEND_LOCATIONS) {
		const body = locationBody(config, location);
		if (!body) {
			findings.push(`${location}: response block is missing`);
			continue;
		}
		for (const header of REQUIRED_HEADERS) {
			if (!body.includes(header)) findings.push(`${location}: missing ${header}`);
		}
		if (body.includes('Cross-Origin-Embedder-Policy')) {
			findings.push(`${location}: COEP must remain application-config opt-in`);
		}
	}
	return findings;
}

export { nginxSecurityFindings };
