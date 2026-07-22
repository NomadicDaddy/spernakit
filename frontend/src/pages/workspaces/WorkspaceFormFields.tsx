import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface WorkspaceFormFieldsProps {
	description: string;
	idPrefix: string;
	name: string;
	onFieldChange: (field: string, value: string) => void;
	slug?: string;
}

function WorkspaceFormFields({
	description,
	idPrefix,
	name,
	onFieldChange,
	slug,
}: WorkspaceFormFieldsProps) {
	return (
		<>
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}-name`}>Name *</Label>
				<Input
					autoComplete="off"
					id={`${idPrefix}-name`}
					onChange={(e) => onFieldChange('name', e.target.value)}
					placeholder="My Workspace"
					value={name}
				/>
			</div>
			{slug !== undefined && (
				<div className="space-y-2">
					<Label htmlFor={`${idPrefix}-slug`}>Slug</Label>
					<Input
						autoComplete="off"
						id={`${idPrefix}-slug`}
						onChange={(e) => onFieldChange('slug', e.target.value)}
						placeholder="my-workspace"
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
					placeholder="Optional description"
					rows={3}
					value={description}
				/>
			</div>
		</>
	);
}

export { WorkspaceFormFields };
