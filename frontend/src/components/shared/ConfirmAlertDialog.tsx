import type { ReactNode } from 'react';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmAlertDialogProps {
	cancelText?: string;
	confirmText?: string;
	description: ReactNode;
	isOpen: boolean;
	isPending?: boolean;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	title: string;
}

export function ConfirmAlertDialog({
	cancelText = 'Cancel',
	confirmText = 'Confirm',
	description,
	isOpen,
	isPending,
	onConfirm,
	onOpenChange,
	title,
}: ConfirmAlertDialogProps) {
	// Radix `AlertDialogDescription` renders a <p>. Plain strings/numbers are
	// safe inline children, but JSX descriptions may contain block-level
	// elements that cause invalid DOM nesting. For non-plain descriptions,
	// swap the tag via `asChild` and use a <div> wrapper to preserve the
	// description semantics without the <p> constraint.
	const isPlainDescription = typeof description === 'number' || typeof description === 'string';

	return (
		<AlertDialog onOpenChange={onOpenChange} open={isOpen}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{isPlainDescription ? (
						<AlertDialogDescription>{description}</AlertDialogDescription>
					) : (
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground text-sm">{description}</div>
						</AlertDialogDescription>
					)}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{cancelText}</AlertDialogCancel>
					<AlertDialogAction disabled={isPending} onClick={onConfirm}>
						{isPending ? `${confirmText}…` : confirmText}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
