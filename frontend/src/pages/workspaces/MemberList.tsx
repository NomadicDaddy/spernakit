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
		return <div className="py-4 text-center text-muted-foreground">No members yet</div>;
	}

	return (
		/*
		 * One bordered shell with divided rows, in place of five separately bordered cards. At the
		 * row height this gives (~49px, the same as a table row on the workspace list itself) five
		 * members occupy roughly 245px instead of 347px and the dialog's scroller disappears.
		 */
		<div className="divide-y divide-border/60 overflow-hidden rounded-lg border">
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
