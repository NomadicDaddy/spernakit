import { useState } from 'react';

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
	const [value, setValue] = useState(initialValue);

	const handleOpenChange = (open: boolean) => {
		setValue(initialValue);
		onOpenChange(open);
	};

	const handleSubmit = () => {
		onSubmit(value.trim());
		setValue(initialValue);
		onOpenChange(false);
	};

	const fieldId = `form-input-${title.toLowerCase().replace(/\s+/g, '-')}`;

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
							autoComplete="off"
							id={fieldId}
							onChange={(e) => setValue(e.target.value)}
							placeholder={placeholder}
							value={value}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={() => handleOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button disabled={!value.trim() || isPending} onClick={handleSubmit}>
						{submitLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { FormInputDialog };
