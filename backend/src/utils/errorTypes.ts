class UniqueConstraintError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UniqueConstraintError';
	}
}

function isUniqueConstraintError(error: unknown): error is UniqueConstraintError {
	return error instanceof UniqueConstraintError;
}

function getRawErrorField(error: unknown, field: 'code' | 'constraint'): string | undefined {
	if (typeof error !== 'object' || error === null || !(field in error)) return undefined;

	const value = (error as Record<typeof field, unknown>)[field];
	return typeof value === 'string' ? value : undefined;
}

function isRawUniqueViolation(error: unknown, target?: string): boolean {
	const message = error instanceof Error ? error.message : '';
	const code = getRawErrorField(error, 'code');
	const constraint = getRawErrorField(error, 'constraint');

	if (message.includes('UNIQUE constraint failed:')) {
		return target ? message.includes(`UNIQUE constraint failed: ${target}`) : true;
	}

	const isPostgresUnique =
		code === '23505' || message.includes('duplicate key value violates unique constraint');

	if (!isPostgresUnique) return false;
	if (!target) return true;

	return Boolean(constraint?.includes(target) || message.includes(target));
}

class NotFoundError extends Error {
	constructor(resource: string) {
		super(`${resource} not found`);
		this.name = 'NotFoundError';
	}
}

class MfaAlreadyEnabledError extends Error {
	constructor(message = 'MFA is already enabled. Disable it first to re-configure.') {
		super(message);
		this.name = 'MfaAlreadyEnabledError';
	}
}

function isMfaAlreadyEnabledError(error: unknown): error is MfaAlreadyEnabledError {
	return error instanceof MfaAlreadyEnabledError;
}

function extractErrorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

export {
	extractErrorMessage,
	isMfaAlreadyEnabledError,
	isRawUniqueViolation,
	isUniqueConstraintError,
	MfaAlreadyEnabledError,
	NotFoundError,
	UniqueConstraintError,
};
