import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFreshOnOpen } from '@/hooks/useFreshOnOpen';

interface FormInputDialogProps {
	description?: string;
	fieldLabel: string;
	initialValue?: string;
	isOpen: boolean;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (value: string) => void;
	placeholder?: string;
	submitLabel?: string;
	title: string;
}

function FormInputDialog({
	description,
	fieldLabel,
	initialValue = '',
	isOpen,
	isPending,
	onOpenChange,
	onSubmit,
	placeholder,
	submitLabel = 'Save',
	title,
}: FormInputDialogProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState(initialValue);
	const [fieldError, setFieldError] = useState<null | string>(null);

	/*
	 * Opening is the only moment the field is put back. It used to be put back on the way out of
	 * handleSubmit, which also closed the dialog, so a name the server refused was gone from the
	 * screen before the error toast arrived. The dialog now stays open until the caller closes it,
	 * which the caller does when the request succeeds.
	 */
	useFreshOnOpen(isOpen, () => {
		setValue(initialValue);
		setFieldError(null);
	});

	const handleSubmit = () => {
		if (isPending) return;
		const trimmedValue = value.trim();
		if (!trimmedValue) {
			setFieldError(`${fieldLabel} is required`);
			inputRef.current?.focus();
			return;
		}
		setFieldError(null);
		onSubmit(trimmedValue);
	};

	const fieldId = `form-input-${title.toLowerCase().replace(/\s+/g, '-')}`;
	const fieldErrorId = `${fieldId}-error`;

	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				{/*
				 * DialogContent's `gap-4` owns the rhythm between header, body and footer. The
				 * body used to add `py-4` on top of it, which made the measured rhythm inside a
				 * one-field panel 8px / 32px / 8px / 32px — doubled where the regions meet and
				 * tight where the label meets its input.
				 */}
				<div className="space-y-2">
					<Label htmlFor={fieldId}>{fieldLabel}</Label>
					<Input
						aria-describedby={fieldError ? fieldErrorId : undefined}
						autoComplete="off"
						id={fieldId}
						onChange={(e) => {
							setValue(e.target.value);
							if (e.target.value.trim()) {
								setFieldError(null);
							}
						}}
						placeholder={placeholder}
						ref={inputRef}
						required
						value={value}
						{...(fieldError ? { 'aria-invalid': true } : {})}
					/>
					{fieldError && (
						<p
							aria-live="polite"
							className="text-sm text-destructive"
							id={fieldErrorId}>
							{fieldError}
						</p>
					)}
				</div>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button disabled={isPending} onClick={handleSubmit}>
						{submitLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { FormInputDialog };
