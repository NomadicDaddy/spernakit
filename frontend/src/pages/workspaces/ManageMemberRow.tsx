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
		/*
		 * A row in a list, not a card. Five members used to render as five individually bordered
		 * `rounded-lg border p-3` cards at 63px each, stacked with 8px gaps — 347px, enough to push
		 * the dialog's `max-h-96` scroller to its limit — and three nested rounded rectangles once
		 * you count the dialog itself. The shell and the dividers now live on MemberList.
		 *
		 * The trailing columns are the same widths `AddMemberFormRow` uses (`w-32` role, `w-16`
		 * action, `gap-3`, `px-3`), so the add row reads as the first row of one column grid
		 * instead of a separate form whose role control sits 26px off the column below it.
		 */
		<div className="flex items-center gap-3 px-3 py-2">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<Checkbox
					aria-label={`Select ${member.username} for bulk member actions`}
					checked={isSelected}
					onCheckedChange={() => onToggleSelection(member.userId)}
				/>
				<div className="min-w-0">
					<div className="truncate font-medium">{member.username}</div>
					{/*
					 * The email, not "User ID: 1". The row's only supporting line was the raw
					 * database key, which reads as debug output; /settings/users pairs a username
					 * with an email and this is the same identity.
					 */}
					<div className="truncate text-xs text-muted-foreground">{member.email}</div>
				</div>
			</div>
			<RoleSelector
				className="h-8 w-32 shrink-0"
				onValueChange={(role) => onUpdateRole(member.userId, role)}
				roles={WORKSPACE_ROLE_OPTIONS}
				value={member.role}
			/>
			<div className="flex w-16 shrink-0 justify-end">
				<Button
					aria-label={`Remove ${member.username} from workspace`}
					onClick={() => onRemove(member.userId)}
					size="icon"
					variant="ghost">
					<Trash2 aria-hidden="true" className="size-4" />
				</Button>
			</div>
		</div>
	);
}

export { ManageMemberRow };
