import type { SendEmailResult } from './emailTypes.ts';

import { getConfig } from '../../config/configLoader.ts';
import { formatDuration } from '../../utils/formatDuration.ts';
import { sendEmail } from './smtpTransport.ts';

/**
 * Escape HTML special characters for safe interpolation into HTML templates.
 * @param str
 * @returns Escaped string safe for HTML interpolation
 */
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Send a password reset email with a reset link.
 *
 * @param to - Recipient email address
 * @param resetToken - The password reset token
 * @returns SendEmailResult indicating whether the email was sent
 */
async function sendPasswordResetEmail(to: string, resetToken: string): Promise<SendEmailResult> {
	const config = getConfig();
	const resetUrl = `${config.server.frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
	const safeResetUrl = escapeHtml(resetUrl);
	const expiryDuration = escapeHtml(formatDuration(config.security.passwordResetTokenExpiryMs));

	const subject = 'Password Reset Request';
	const text = `You have requested to reset your password.

Click the link below to reset your password:
${resetUrl}

This link will expire in ${expiryDuration}.

If you did not request this password reset, please ignore this email.`;

	const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<h2 style="color: #1a1a1a;">Password Reset Request</h2>
	<p>You have requested to reset your password.</p>
	<p>Click the button below to reset your password:</p>
	<p style="text-align: center; margin: 30px 0;">
		<a href="${safeResetUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">Reset Password</a>
	</p>
	<p style="font-size: 14px; color: #666;">This link will expire in ${expiryDuration}.</p>
	<p style="font-size: 14px; color: #666;">If you did not request this password reset, please ignore this email.</p>
	<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
	<p style="font-size: 12px; color: #999;">This is an automated message. Please do not reply to this email.</p>
</body>
</html>`;

	return sendEmail({ html, subject, text, to });
}

/**
 * Send an email verification link to the user.
 *
 * @param to - Recipient email address
 * @param verificationToken - The plaintext verification token
 * @returns SendEmailResult indicating whether the email was sent
 */
async function sendVerificationEmail(
	to: string,
	verificationToken: string
): Promise<SendEmailResult> {
	const config = getConfig();
	const verifyUrl = `${config.server.frontendUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
	const safeVerifyUrl = escapeHtml(verifyUrl);
	const expiryDuration = escapeHtml(
		formatDuration(config.security.emailVerificationTokenExpiryMs)
	);

	const subject = 'Verify Your Email Address';
	const text = `Welcome! Please verify your email address.

Click the link below to verify your email:
${verifyUrl}

This link will expire in ${expiryDuration}.

If you did not create an account, please ignore this email.`;

	const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<h2 style="color: #1a1a1a;">Verify Your Email Address</h2>
	<p>Welcome! Please verify your email address to complete your registration.</p>
	<p>Click the button below to verify your email:</p>
	<p style="text-align: center; margin: 30px 0;">
		<a href="${safeVerifyUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">Verify Email</a>
	</p>
	<p style="font-size: 14px; color: #666;">This link will expire in ${expiryDuration}.</p>
	<p style="font-size: 14px; color: #666;">If you did not create an account, please ignore this email.</p>
	<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
	<p style="font-size: 12px; color: #999;">This is an automated message. Please do not reply to this email.</p>
</body>
</html>`;

	return sendEmail({ html, subject, text, to });
}

/**
 * Send a confirmation link to the NEW email address to complete an email change.
 * The change is NOT applied until the user clicks the link.
 *
 * @param to - The new email address being confirmed
 * @param token - One-time confirmation token
 * @returns SendEmailResult indicating whether the email was sent
 */
async function sendEmailChangeConfirmation(to: string, token: string): Promise<SendEmailResult> {
	const config = getConfig();
	const confirmUrl = `${config.server.frontendUrl}/confirm-email-change?token=${encodeURIComponent(token)}`;
	const safeConfirmUrl = escapeHtml(confirmUrl);
	const expiryDuration = escapeHtml(formatDuration(config.security.emailChangeTokenExpiryMs));

	const subject = 'Confirm Your New Email Address';
	const text = `An email change was requested for your account.

Click the link below to confirm this new email address:
${confirmUrl}

This link will expire in ${expiryDuration}.

If you did not request this change, you can ignore this email. Your account email will not change.`;

	const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<h2 style="color: #1a1a1a;">Confirm Your New Email Address</h2>
	<p>An email change was requested for your account.</p>
	<p>Click the button below to confirm this new email address:</p>
	<p style="text-align: center; margin: 30px 0;">
		<a href="${safeConfirmUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">Confirm Email Change</a>
	</p>
	<p style="font-size: 14px; color: #666;">This link will expire in ${expiryDuration}.</p>
	<p style="font-size: 14px; color: #666;">If you did not request this change, you can ignore this email. Your account email will not change.</p>
	<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
	<p style="font-size: 12px; color: #999;">This is an automated message. Please do not reply to this email.</p>
</body>
</html>`;

	return sendEmail({ html, subject, text, to });
}

/**
 * Notify the OLD email address that a change was requested. Contains no link —
 * its sole purpose is to alert the original owner if the account has been compromised.
 *
 * @param to - The current (old) email address on the account
 * @param newEmail - The proposed new email address (displayed for transparency)
 * @returns SendEmailResult indicating whether the email was sent
 */
async function sendEmailChangeNotification(to: string, newEmail: string): Promise<SendEmailResult> {
	const safeNewEmail = escapeHtml(newEmail);
	const subject = 'Email Change Requested';
	const text = `An email change was requested on your account.

The account email would be changed to: ${newEmail}

The change will not take effect until the new address is confirmed via a link sent to it.

If you did not request this change, your account may be compromised. Sign in and change your password immediately.`;

	const html = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
	<h2 style="color: #1a1a1a;">Email Change Requested</h2>
	<p>An email change was requested on your account.</p>
	<p>The account email would be changed to: <strong>${safeNewEmail}</strong></p>
	<p>The change will not take effect until the new address is confirmed via a link sent to it.</p>
	<p style="font-size: 14px; color: #b91c1c;"><strong>If you did not request this change, your account may be compromised. Sign in and change your password immediately.</strong></p>
	<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
	<p style="font-size: 12px; color: #999;">This is an automated message. Please do not reply to this email.</p>
</body>
</html>`;

	return sendEmail({ html, subject, text, to });
}

export {
	escapeHtml,
	sendEmailChangeConfirmation,
	sendEmailChangeNotification,
	sendPasswordResetEmail,
	sendVerificationEmail,
};
