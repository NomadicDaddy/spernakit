import type { WorkspaceMember } from '@/api/types';

import { Badge } from '@/components/ui/badge';

/** Read-only counterpart to `ManageMemberRow`; same row geometry, same identity pairing. */
function ViewMemberRow({ member }: { member: WorkspaceMember }) {
	return (
		<div className="flex items-center justify-between gap-3 px-3 py-2">
			<div className="min-w-0">
				<div className="truncate font-medium">{member.username}</div>
				<div className="truncate text-xs text-muted-foreground">{member.email}</div>
			</div>
			<Badge variant="outline">{member.role}</Badge>
		</div>
	);
}

export { ViewMemberRow };
