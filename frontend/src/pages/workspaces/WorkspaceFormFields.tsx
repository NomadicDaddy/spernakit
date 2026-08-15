import type { Ref } from 'react';

import { RequiredMark } from '@/components/shared/RequiredMark';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface WorkspaceFormFieldsProps {
	description: string;
	idPrefix: string;
	name: string;
	nameError?: string;
	nameInputRef?: Ref<HTMLInputElement>;
	onFieldChange: (field: string, value: string) => void;
	slug?: string;
}

function WorkspaceFormFields({
	description,
	idPrefix,
	name,
	nameError,
	nameInputRef,
	onFieldChange,
	slug,
}: WorkspaceFormFieldsProps) {
	const nameErrorId = `${idPrefix}-name-error`;

	return (
		<>
			<div className="space-y-2">
				{/*
				 * The shared marker, not a literal `*` in the label text. Written literally it
				 * rendered in the label's own grey rather than destructive-red, and — having no
				 * `aria-hidden` — it joined the field's accessible name, so both workspace dialogs
				 * announced the field as "Name star".
				 */}
				<Label htmlFor={`${idPrefix}-name`}>
					Name <RequiredMark />
				</Label>
				<Input
					aria-describedby={nameError ? nameErrorId : undefined}
					autoComplete="off"
					id={`${idPrefix}-name`}
					onChange={(e) => onFieldChange('name', e.target.value)}
					placeholder="e.g. Acme Operations…"
					ref={nameInputRef}
					required
					value={name}
					{...(nameError ? { 'aria-invalid': true } : {})}
				/>
				{nameError && (
					<p aria-live="polite" className="text-sm text-destructive" id={nameErrorId}>
						{nameError}
					</p>
				)}
			</div>
			{slug !== undefined && (
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-slug`}>Slug</Label>
					<Input
						autoComplete="off"
						id={`${idPrefix}-slug`}
						onChange={(e) => onFieldChange('slug', e.target.value)}
						placeholder="e.g. acme-operations…"
						value={slug}
					/>
				</div>
			)}
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}-description`}>Description</Label>
				<Textarea
					autoComplete="off"
					className="resize-y"
					id={`${idPrefix}-description`}
					onChange={(e) => onFieldChange('description', e.target.value)}
					placeholder="e.g. Shared workspace for operations…"
					rows={3}
					value={description}
				/>
			</div>
		</>
	);
}

export { WorkspaceFormFields };
