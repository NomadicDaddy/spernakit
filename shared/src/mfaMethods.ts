/**
 * Multi-factor authentication method identifiers. The const array is the runtime
 * source of truth; the `MfaMethod` literal union is derived from it so the
 * list and type cannot drift.
 *
 * Add a new method by appending to `MFA_METHODS` — the Drizzle schema enum
 * (SQLite + PostgreSQL) and the frontend API type both reference this constant.
 */

const MFA_METHODS = ['totp', 'email', 'sms'] as const;

type MfaMethod = (typeof MFA_METHODS)[number];

export { MFA_METHODS };
export type { MfaMethod };
