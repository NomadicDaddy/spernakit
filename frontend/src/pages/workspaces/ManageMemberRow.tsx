import { Trash2 } from 'lucide-react';

import type { WorkspaceMember } from '@/api/types';

import { RoleSelector } from '@/components/shared/RoleSelector';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

import { WORKSPACE_ROLE_OPTIONS } from './constants';

interface ManageMemberRowProps {
	isSelected: boolean;
	member: WorkspaceMember;
	onRemove: (userId: number) => void;
	onToggleSelection: (userId: number) => void;
	onUpdateRole: (userId: number, role: string) => void;
}

function ManageMemberRow({
	isSelected,
	member,
	onRemove,
	onToggleSelection,
	onUpdateRole,
}: ManageMemberRowProps) {
	return (
		<div className="flex items-center justify-between rounded-lg border p-3">
			<div className="flex items-center gap-3">
				<Checkbox
					checked={isSelected}
					onCheckedChange={() => onToggleSelection(member.userId)}
				/>
				<div>
					<div className="font-medium">{member.username}</div>
					<div className="text-muted-foreground text-xs">User ID: {member.userId}</div>
				</div>
			</div>
			<div className="flex items-center gap-3">
				<RoleSelector
					className="h-8 w-28"
					onValueChange={(role) => onUpdateRole(member.userId, role)}
					roles={WORKSPACE_ROLE_OPTIONS}
					value={member.role}
				/>
				<Button
					aria-label="Remove member"
					className="h-8 w-8 p-0"
					onClick={() => onRemove(member.userId)}
					title="Remove"
					variant="ghost">
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}

export { ManageMemberRow };
