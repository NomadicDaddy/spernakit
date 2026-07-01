/**
 * Demo accounts service.
 * Provides demo account credentials for development and testing.
 */

import { getConfig } from '../config/configLoader.ts';
import { getCredentials } from '../utils/auth/passwordGenerator.ts';
import { logger } from '../utils/logger.ts';
import { isLoopbackAddressOrHostname } from '../utils/loopback.ts';

export interface DemoAccount {
	description: string;
	password: string;
	role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'SYSOP' | 'VIEWER';
	username: string;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
	ADMIN: 'Application administrator',
	MANAGER: 'Team and workspace manager',
	OPERATOR: 'Standard operator with data entry',
	SYSOP: 'System administrator with full access',
	VIEWER: 'Read-only access to permitted resources',
};

const ROLE_ORDER = ['SYSOP', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] as const;

/**
 * Get demo accounts if in development mode.
 * Returns null in all non-development environments.
 * @param clientIp
 * @returns Array of demo accounts or null if unavailable
 */
export function getDemoAccounts(clientIp?: string): DemoAccount[] | null {
	const config = getConfig();

	// Only expose demo accounts in explicit development mode — all other
	// environments (production, staging, QA, test) are blocked.
	if (config.server.nodeEnv !== 'development') {
		return null;
	}

	// Defense-in-depth: block demo credentials from non-loopback IPs even in development
	if (clientIp && !isLoopbackAddressOrHostname(clientIp)) {
		logger.warn(
			{ clientIp },
			'Demo accounts endpoint blocked from non-loopback IP in development mode'
		);
		return null;
	}

	const credentials = getCredentials();

	const accounts: DemoAccount[] = ROLE_ORDER.map((role, index) => {
		const cred = credentials[index];
		if (!cred) {
			throw new Error(`Missing credential for role ${role}`);
		}
		return {
			description: ROLE_DESCRIPTIONS[role] ?? 'Unknown role',
			password: cred.password,
			role,
			username: cred.username,
		};
	});

	return accounts;
}
