import { Bug, MessageSquarePlus } from 'lucide-react';
import { useRef, useState } from 'react';

import type { BugReport, BugReportKind } from '@/lib/bugReport';

import { ApiError } from '@/api/apiError';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { captureBugMetadata } from '@/lib/bugReport';
import { lazyToast } from '@/lib/lazyToast';

interface BugReportButtonProps {
	onSubmit: (report: BugReport) => Promise<void>;
}

interface KindCopy {
	descriptionLabel: string;
	dialogDescription: string;
	placeholder: string;
	submitLabel: string;
	successDescription: string;
	successTitle: string;
	title: string;
	triggerLabel: string;
}

const COPY: Record<BugReportKind, KindCopy> = {
	bug: {
		descriptionLabel: 'Description *',
		dialogDescription:
			'Describe the issue you encountered. Technical details will be captured automatically to help us diagnose the problem.',
		placeholder: 'What happened? What did you expect to happen?',
		submitLabel: 'Submit Report',
		successDescription: 'Thank you for helping us improve! We will look into this issue.',
		successTitle: 'Bug report submitted',
		title: 'Report a Bug',
		triggerLabel: 'Report a bug or request a feature',
	},
	feature: {
		descriptionLabel: 'Request *',
		dialogDescription:
			'Describe the capability you’d like to see. Context about the page you’re on will be captured to help us understand the request.',
		placeholder: 'What should the app do? Why is this valuable?',
		submitLabel: 'Submit Request',
		successDescription:
			'Thank you for the suggestion! We will review it and consider it for a future release.',
		successTitle: 'Feature request submitted',
		title: 'Request a Feature',
		triggerLabel: 'Report a bug or request a feature',
	},
};

/**
 * Bug report and feature request submission component.
 * Opens a dialog with a Bug / Feature toggle and automatic metadata capture.
 */
function BugReportButton({ onSubmit }: BugReportButtonProps) {
	const [open, setOpen] = useState(false);
	const [kind, setKind] = useState<BugReportKind>('bug');
	const [description, setDescription] = useState('');
	const [email, setEmail] = useState('');
	const [emailError, setEmailError] = useState<null | string>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const emailRef = useRef<HTMLInputElement>(null);

	const copy = COPY[kind];

	/*
	 * Called on a successful submit and nowhere else. Closing the dialog deliberately keeps the
	 * draft: a click aimed at a Submit button that has scrolled below the fold lands on the
	 * overlay instead, and resetting there threw away reports of a thousand characters and more
	 * with no way to get them back. Reopening restores whatever was typed.
	 */
	const resetForm = () => {
		setDescription('');
		setEmail('');
		setEmailError(null);
		setKind('bug');
	};

	const handleSubmit = async () => {
		if (!description.trim()) {
			lazyToast.error(kind === 'bug' ? 'Description required' : 'Request required', {
				description:
					kind === 'bug'
						? 'Please provide a brief description of the bug.'
						: 'Please describe the feature or enhancement you would like.',
			});
			return;
		}

		/*
		 * The dialog's fields are not wrapped in a <form> and the submit button is an onClick
		 * handler, so the Email input's `type="email"` never runs native constraint validation on
		 * its own — the browser only enforces it on a form submission. Ask the input for its own
		 * verdict instead. Without this a mistyped address reaches the API, comes back as a 400
		 * that names no field, and the catch below reports it as something worth retrying.
		 */
		if (email.trim() && emailRef.current && !emailRef.current.checkValidity()) {
			setEmailError('Enter a valid email address, or leave the field empty.');
			emailRef.current.focus();
			return;
		}
		setEmailError(null);

		setIsSubmitting(true);

		try {
			const metadata = captureBugMetadata();
			const report: BugReport = {
				description: description.trim(),
				kind,
				metadata,
			};

			const trimmedEmail = email.trim();
			if (trimmedEmail) {
				report.email = trimmedEmail;
			}

			await onSubmit(report);

			lazyToast.success(copy.successTitle, { description: copy.successDescription });

			resetForm();
			setOpen(false);
		} catch (err) {
			/*
			 * A 400 is the server refusing this particular body, so "try again later" is the one
			 * thing that cannot help — the same request fails the same way forever. Show what the
			 * server said instead, and put the message on the email field when that is what it
			 * rejected, since the email is the only value here a user can get wrong by typing.
			 */
			if (err instanceof ApiError && err.status === 400) {
				const message = err.message || 'Check the details and try again.';
				if (/email/i.test(message)) {
					setEmailError('Enter a valid email address, or leave the field empty.');
					emailRef.current?.focus();
				}
				lazyToast.error('Submission rejected', { description: message });
			} else {
				lazyToast.error('Submission failed', {
					description: 'Could not submit. Please try again later.',
				});
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void handleSubmit();
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button
					aria-label={copy.triggerLabel}
					className="text-muted-foreground hover:text-foreground"
					size="icon"
					title={copy.triggerLabel}
					variant="ghost">
					<Bug className="size-5" />
				</Button>
			</DialogTrigger>
			{/*
			  A viewport-capped height with the field block as the only scrolling row, so
			  the footer stays on screen however long the description grows. Without the cap
			  the dialog simply grew past the bottom of the window, 1,192px tall in a 566px
			  viewport, and because <body> is overflow:hidden while a dialog is open nothing
			  scrolled and Submit could not be reached at all. The row template names
			  DialogContent's four children: header, tabs, fields, footer.
			*/}
			<DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{kind === 'bug' ? (
							<Bug aria-hidden="true" className="size-5" />
						) : (
							<MessageSquarePlus aria-hidden="true" className="size-5" />
						)}
						{copy.title}
					</DialogTitle>
					<DialogDescription>{copy.dialogDescription}</DialogDescription>
				</DialogHeader>
				<Tabs onValueChange={(value) => setKind(value as BugReportKind)} value={kind}>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="bug">Bug</TabsTrigger>
						<TabsTrigger value="feature">Feature Request</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className="min-h-0 space-y-4 overflow-y-auto py-2">
					<div className="space-y-2">
						<Label htmlFor="bug-description">{copy.descriptionLabel}</Label>
						<Textarea
							autoComplete="off"
							className="min-h-[100px] resize-none"
							id="bug-description"
							onChange={(e) => setDescription(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={copy.placeholder}
							value={description}
						/>
						<p className="text-xs text-muted-foreground">Press Ctrl+Enter to submit</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="bug-email">Email (optional)</Label>
						<Input
							aria-describedby={emailError ? 'bug-email-error' : undefined}
							autoComplete="email"
							id="bug-email"
							onChange={(e) => {
								setEmail(e.target.value);
								if (emailError) setEmailError(null);
							}}
							placeholder="your@email.com"
							ref={emailRef}
							spellCheck={false}
							type="email"
							value={email}
							{...(emailError ? { 'aria-invalid': true } : {})}
						/>
						{emailError ? (
							<p
								aria-live="polite"
								className="text-sm text-destructive"
								id="bug-email-error">
								{emailError}
							</p>
						) : (
							<p className="text-xs text-muted-foreground">
								Provide email if you’d like follow-up on this{' '}
								{kind === 'bug' ? 'issue' : 'request'}
							</p>
						)}
					</div>
					<div className="rounded-md bg-muted/50 p-3">
						<p className="text-xs text-muted-foreground">
							<span className="font-medium">Auto-captured:</span> URL, browser info,
							screen size, timezone, theme
						</p>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={() => setOpen(false)} variant="outline">
						Cancel
					</Button>
					{/*
					  Disabled while the required description is empty or whitespace, matching the
					  other required-field dialogs in the app. handleSubmit keeps its own check
					  because Ctrl+Enter reaches it without the button.
					*/}
					<Button
						disabled={isSubmitting || description.trim().length === 0}
						onClick={() => void handleSubmit()}>
						{isSubmitting ? (
							<>
								<Spinner size={16} />
								Submitting…
							</>
						) : (
							copy.submitLabel
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { BugReportButton };
