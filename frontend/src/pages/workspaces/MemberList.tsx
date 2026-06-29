import type { WorkspaceMember } from '@/api/types';

import { ManageMemberRow } from './ManageMemberRow';

interface MemberListProps {
	members: WorkspaceMember[];
	onRemove: (userId: number) => void;
	onToggleSelection: (userId: number) => void;
	onUpdateRole: (userId: number, role: string) => void;
	selectedUserIds: Set<number>;
}

function MemberList({
	members,
	onRemove,
	onToggleSelection,
	onUpdateRole,
	selectedUserIds,
}: MemberListProps) {
	if (members.length === 0) {
		return <div className="text-muted-foreground py-4 text-center">No members yet</div>;
	}

	return (
		<div className="space-y-2">
			{members.map((member) => (
				<ManageMemberRow
					isSelected={selectedUserIds.has(member.userId)}
					key={`${member.workspaceId}-${member.userId}`}
					member={member}
					onRemove={onRemove}
					onToggleSelection={onToggleSelection}
					onUpdateRole={onUpdateRole}
				/>
			))}
		</div>
	);
}

export { MemberList };
