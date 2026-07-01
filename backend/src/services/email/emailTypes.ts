interface SendEmailInput {
	html?: string;
	subject: string;
	text?: string;
	to: string;
}

type SendEmailResult =
	| { error?: Error; reason: 'not_configured'; success: false }
	| { error?: Error; reason: 'send_failed'; success: false }
	| { reason: 'sent'; success: true };

export type { SendEmailInput, SendEmailResult };
