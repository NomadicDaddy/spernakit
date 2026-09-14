interface MfaTokenLocation {
	hash: string;
	search: string;
	state: unknown;
}

interface MfaTokenTransport {
	fragmentToken: string;
	stateToken: string;
}

function readStateToken(state: unknown): string {
	if (typeof state !== 'object' || state === null || !('mfaToken' in state)) return '';
	return typeof state.mfaToken === 'string' ? state.mfaToken : '';
}

function readMfaTokenTransport(location: MfaTokenLocation): MfaTokenTransport {
	return {
		fragmentToken: new URLSearchParams(location.hash.replace(/^#/, '')).get('mfaToken') ?? '',
		stateToken: readStateToken(location.state),
	};
}

export { readMfaTokenTransport };
