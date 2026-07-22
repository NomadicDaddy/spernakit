import { Bug, MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { BugReport, BugReportKind } from '@/lib/bugReport';

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
	const [isSubmitting, setIsSubmitting] = useState(false);

	const copy = COPY[kind];

	const resetForm = () => {
		setDescription('');
		setEmail('');
		setKind('bug');
	};

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) {
			resetForm();
		}
	};

	const handleSubmit = async () => {
		if (!description.trim()) {
			toast.error(kind === 'bug' ? 'Description required' : 'Request required', {
				description:
					kind === 'bug'
						? 'Please provide a brief description of the bug.'
						: 'Please describe the feature or enhancement you would like.',
			});
			return;
		}

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

			toast.success(copy.successTitle, { description: copy.successDescription });

			resetForm();
			setOpen(false);
		} catch {
			toast.error('Submission failed', {
				description: 'Could not submit. Please try again later.',
			});
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
		<Dialog onOpenChange={handleOpenChange} open={open}>
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
			<DialogContent className="sm:max-w-md">
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
				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<Label htmlFor="bug-description">{copy.descriptionLabel}</Label>
						<Textarea
							className="min-h-[100px] resize-none"
							id="bug-description"
							onChange={(e) => setDescription(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={copy.placeholder}
							value={description}
						/>
						<p className="text-muted-foreground text-xs">Press Ctrl+Enter to submit</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="bug-email">Email (optional)</Label>
						<Input
							id="bug-email"
							onChange={(e) => setEmail(e.target.value)}
							placeholder="your@email.com"
							spellCheck={false}
							type="email"
							value={email}
						/>
						<p className="text-muted-foreground text-xs">
							Provide email if you’d like follow-up on this{' '}
							{kind === 'bug' ? 'issue' : 'request'}
						</p>
					</div>
					<div className="bg-muted/50 rounded-md p-3">
						<p className="text-muted-foreground text-xs">
							<span className="font-medium">Auto-captured:</span> URL, browser info,
							screen size, timezone, theme
						</p>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={() => handleOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button disabled={isSubmitting} onClick={() => void handleSubmit()}>
						{isSubmitting ? (
							<>
								<Spinner className="mr-2" size={16} />
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
