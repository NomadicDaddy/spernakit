/**
 * Email Service — Facade.
 *
 * Re-exports public API from the email/ subdirectory.
 * No business logic belongs in this file.
 */
export {
	escapeHtml,
	sendEmailChangeConfirmation,
	sendEmailChangeNotification,
	sendPasswordResetEmail,
	sendVerificationEmail,
} from './email/emailTemplates.ts';
export type { SendEmailResult } from './email/emailTypes.ts';
export { sendEmail } from './email/smtpTransport.ts';
