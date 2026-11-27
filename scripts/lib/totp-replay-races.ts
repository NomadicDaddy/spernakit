/**
 * Helpers for scripts/test-totp-replay.ts: TOTP code generation, and the enrollment state-transition
 * fixtures (Roger #67914). Each fixture changes the enrollment between the read a check makes and
 * the write that follows it, at a point the service reaches deterministically: a synchronous write
 * made right after starting the call lands after its row read and before its first await settles.
 */
import { createHmac } from 'node:crypto';

import { eq, getDb } from '../../backend/src/db/index.ts';
import { mfaSettings } from '../../backend/src/db/schema/mfaSettings.ts';
import { users } from '../../backend/src/db/schema/users.ts';
import {
	disableMfa,
	regenerateRecoveryCodes,
	setupMfa,
	verifyCode,
	verifySetup,
} from '../../backend/src/services/auth/mfaService.ts';
import { decrypt, encrypt } from '../../backend/src/utils/encryption.ts';

export const PERIOD_MS = 30_000;
type Assert = (condition: boolean, message: string) => void;
type Row = typeof mfaSettings.$inferSelect;

/** RFC 4648 base32, as authenticator apps read the setup secret. */
export function base32Decode(text: string): Buffer {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const char of text.replace(/=+$/, '').toUpperCase()) {
		const value = alphabet.indexOf(char);
		if (value < 0) throw new Error(`not base32: ${char}`);
		bits += value.toString(2).padStart(5, '0');
	}
	const bytes: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8)
		bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
	return Buffer.from(bytes);
}

/**
 * The 6-digit code for one 30-second time step (RFC 6238 over RFC 4226, HMAC-SHA1). Computed here
 * rather than with the backend's otpauth package, which the root manifest doesn't carry; it also
 * cross-checks the backend's matching against an independent implementation.
 */
export function totpCode(key: Buffer, step: number): string {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(step));
	const hmac = createHmac('sha1', key).update(counter).digest();
	const offset = (hmac.at(-1) ?? 0) & 0x0f;
	const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
	return String(binary % 1_000_000).padStart(6, '0');
}

/** Insert a user and start MFA setup; returns a code generator for its secret. */
async function prepare(userId: number, now: number): Promise<(stepOffset: number) => string> {
	getDb()
		.insert(users)
		.values({
			email: `mfa${userId}@example.com`,
			id: userId,
			passwordHash: 'x',
			role: 'OPERATOR',
			username: `mfa${userId}`,
		})
		.run();
	const key = base32Decode((await setupMfa(userId)).secret);
	return (stepOffset) => totpCode(key, Math.floor(now / PERIOD_MS) + stepOffset);
}

/** Prepare a user and enable MFA with the previous step's code, which that consumes. */
async function enroll(userId: number, now: number): Promise<(stepOffset: number) => string> {
	const codeAt = await prepare(userId, now);
	if (!(await verifySetup(userId, codeAt(-1)))) throw new Error(`enroll ${userId} failed`);
	return codeAt;
}

const rowOf = (userId: number): Row | undefined =>
	getDb().select().from(mfaSettings).where(eq(mfaSettings.userId, userId)).get();
const setRow = (userId: number, change: Partial<Row>): void =>
	void getDb().update(mfaSettings).set(change).where(eq(mfaSettings.userId, userId)).run();

/** Runs the seven enrollment fixtures for users 20 to 26. */
export async function checkEnrollmentRaces(assert: Assert, now: number): Promise<void> {
	const otherSecret = await encrypt('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');

	// 1. The secret is replaced while the login check decrypts: refused, and no step is spent.
	let codeAt = await enroll(20, now);
	const before20 = rowOf(20)?.lastAcceptedTotpStep;
	const resecreted = verifyCode(20, codeAt(0));
	setRow(20, { secretEncrypted: otherSecret });
	assert(!(await resecreted), 'a login checked against a replaced secret is refused');
	assert(rowOf(20)?.lastAcceptedTotpStep === before20, 'the refused login spends no step');

	// 2. The row is replaced (new id, same secret) while the login check decrypts: refused.
	codeAt = await enroll(21, now);
	const replacing = verifyCode(21, codeAt(0));
	const old = rowOf(21);
	if (!old) throw new Error('enrollment 21 missing');
	getDb().delete(mfaSettings).where(eq(mfaSettings.id, old.id)).run();
	getDb()
		.insert(mfaSettings)
		.values({ ...old, id: undefined })
		.run();
	assert(!(await replacing), 'a login checked against a replaced enrollment row is refused');

	// 3. A re-setup replaces the secret while verifySetup decrypts: refused, and MFA stays off.
	codeAt = await prepare(22, now);
	const settingUp = verifySetup(22, codeAt(0));
	setRow(22, { secretEncrypted: otherSecret });
	assert((await settingUp) === null, 'verifySetup refuses an enrollment replaced meanwhile');
	assert(rowOf(22)?.isEnabled === false, 'the replaced enrollment is not enabled');

	// 4. The enrollment is enabled while a second setup encrypts its new secret: setup refuses.
	await prepare(23, now);
	const enabledSecret = rowOf(23)?.secretEncrypted;
	const resetup = setupMfa(23);
	setRow(23, { isEnabled: true });
	const outcome = await resetup.then(
		() => 'replaced',
		(err: unknown) => (err as Error).name,
	);
	assert(outcome !== 'replaced', 'setup refuses to rewrite an enrollment enabled meanwhile');
	assert(rowOf(23)?.secretEncrypted === enabledSecret, 'the enabled secret is kept');

	// 5. A fresh enrollment gets its own step counter.
	await prepare(24, now);
	setRow(24, { lastAcceptedTotpStep: 999_999_999, lastVerifiedAt: new Date() });
	await setupMfa(24);
	assert(
		rowOf(24)?.lastAcceptedTotpStep === null,
		're-setup starts the new secret with no used step',
	);

	// 6. Two regenerates with different fresh codes: exactly one is handed codes, and they're stored.
	codeAt = await enroll(25, now);
	const regens = await Promise.all([
		regenerateRecoveryCodes(25, codeAt(0)),
		regenerateRecoveryCodes(25, codeAt(1)),
	]);
	const winners = regens.filter((r) => r !== null);
	assert(
		winners.length === 1,
		`exactly one concurrent regenerate succeeds, got ${winners.length}`,
	);
	const stored = rowOf(25)?.backupCodesEncrypted;
	const storedCodes = stored ? (JSON.parse(await decrypt(stored)) as string[]) : [];
	assert(
		JSON.stringify(storedCodes) === JSON.stringify(winners[0]),
		"the stored codes are the winner's",
	);

	// 7. Disable and regenerate race: exactly one succeeds, and the stored state is the winner's.
	codeAt = await enroll(26, now);
	const [disabled, regenerated] = await Promise.all([
		disableMfa(26, codeAt(0)),
		regenerateRecoveryCodes(26, codeAt(1)),
	]);
	assert(
		disabled !== (regenerated !== null),
		'exactly one of a racing disable and regenerate succeeds',
	);
	assert(
		disabled ? rowOf(26) === undefined : rowOf(26) !== undefined,
		'the stored state matches the winner',
	);
}
