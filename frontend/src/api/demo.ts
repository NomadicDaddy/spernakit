interface DemoAccount {
	description: string;
	password: string;
	role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'SYSOP' | 'VIEWER';
	username: string;
}

interface DemoAccountsResponse {
	accounts: DemoAccount[];
	warning: string;
}

/**
 * Fetch demo accounts without going through the standard API client.
 * Returns null silently on failure (403 in production, network errors, etc.)
 * to avoid error toasts on the login page.
 */
async function getDemoAccounts(): Promise<DemoAccountsResponse | null> {
	try {
		const res = await fetch('/api/v1/auth/demo-accounts', { credentials: 'include' });
		if (!res.ok) return null;
		const body = (await res.json()) as { data: DemoAccountsResponse };
		return body.data;
	} catch {
		return null;
	}
}

export { getDemoAccounts };
export type { DemoAccount };
