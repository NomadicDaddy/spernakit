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

	const handleOpenChange = (open: boolean) => {
		setValue(initialValue);
		setFieldError(null);
		onOpenChange(open);
	};

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
		setValue(initialValue);
		onOpenChange(false);
	};

	const fieldId = `form-input-${title.toLowerCase().replace(/\s+/g, '-')}`;
	const fieldErrorId = `${fieldId}-error`;

	return (
		<Dialog onOpenChange={handleOpenChange} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				<div className="space-y-4 py-4">
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
				</div>
				<DialogFooter>
					<Button onClick={() => handleOpenChange(false)} variant="outline">
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
