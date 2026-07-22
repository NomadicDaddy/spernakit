import type { WorkspaceMember } from '@/api/types';

interface ViewMemberRowProps {
	member: WorkspaceMember;
}

function ViewMemberRow({ member }: ViewMemberRowProps) {
	return (
		<div className="flex items-center justify-between rounded-lg border p-3">
			<div>
				<div className="font-medium">{member.username}</div>
				<div className="text-muted-foreground text-xs">User ID: {member.userId}</div>
			</div>
			<span className="text-muted-foreground text-sm">{member.role}</span>
		</div>
	);
}

export { ViewMemberRow };
