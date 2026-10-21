import { and, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { endAllRefreshSessions } from '../../utils/auth/refreshSessions.ts';
import { logAuth } from '../../utils/logger.ts';
import { recordPasswordHistory } from './authCore.ts';

/** Sentinel thrown inside the consumption transaction when the token claim loses its race. */
const RESET_TOKEN_CONSUMED = 'RESET_TOKEN_CONSUMED';

/**
 * Run the consumption transaction: history row, the token-re-asserting UPDATE (WHERE id
 * AND resetToken = tokenHash - the 2026-10-20 SECURITY audit High fix, v3.47.6) and
 * refresh-session revocation, atomically. Throws RESET_TOKEN_CONSUMED on a lost claim so
 * the transaction rolls back with the history row.
 *
 * @param user - Pre-update user row selected by reset token
 * @param tokenHash - Hash of the reset token being consumed
 * @param newHash - Newly computed password hash to write
 * @param onClaimed - Post-claim hook; scripts/test-security-fixes.ts injects a failure here
 */
function runConsumptionTransaction(
	user: typeof users.$inferSelect,
	tokenHash: string,
	newHash: string,
	onClaimed: () => void,
): void {
	getDb().transaction((tx) => {
		recordPasswordHistory(user.id, user.passwordHash, tx);

		const consumedRows = tx
			.update(users)
			.set({
				csrfToken: null,
				failedLoginAttempts: 0,
				lockedUntil: null,
				passwordChangedAt: new Date(),
				passwordHash: newHash,
				requiresPasswordChange: false,
				resetToken: null,
				resetTokenExpiresAt: null,
				updatedAt: new Date(),
			})
			.where(and(eq(users.id, user.id), eq(users.resetToken, tokenHash)))
			.returning({ id: users.id })
			.all();
		if (consumedRows.length !== 1) {
			// Throwing rolls the transaction back; the catch maps it to invalid-token.
			throw new Error(RESET_TOKEN_CONSUMED);
		}
		endAllRefreshSessions(user.id, tx);
		onClaimed();
	});
}

/**
 * Consume the reset token in one transaction; true only when the transaction committed.
 * The claim counts only after the transaction returns without throwing, so a post-claim
 * failure (session revocation, commit) rolls everything back and reports failure, never a
 * rolled-back "success". The race loser and a real database failure both return false; the
 * latter logs at error level, and the caller answers both with the bare invalid-token shape
 * so the race never reveals which request won.
 *
 * @param user - Pre-update user row selected by reset token
 * @param tokenHash - Hash of the reset token being consumed
 * @param newHash - Newly computed password hash to write
 * @param onClaimed - Post-claim hook; scripts/test-security-fixes.ts injects a failure here
 * @returns True when this call won the claim AND the transaction committed
 */
function consumeResetToken(
	user: typeof users.$inferSelect,
	tokenHash: string,
	newHash: string,
	onClaimed?: () => void,
): boolean {
	try {
		runConsumptionTransaction(user, tokenHash, newHash, onClaimed ?? (() => {}));
	} catch (err) {
		if (err instanceof Error && err.message === RESET_TOKEN_CONSUMED) return false;
		logAuth('error', 'Password reset consumption failed', {
			error: String(err),
			userId: user.id,
		});
		return false;
	}
	return true;
}

export { consumeResetToken };
