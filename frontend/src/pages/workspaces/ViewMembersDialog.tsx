import type { WorkspaceMember } from '@/api/types';

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { ViewMemberRow } from './ViewMemberRow';

interface ViewMembersDialogProps {
	isOpen: boolean;
	members: WorkspaceMember[];
	onOpenChange: (open: boolean) => void;
}

function ViewMembersDialog({ isOpen, members, onOpenChange }: ViewMembersDialogProps) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={isOpen}>
			<AlertDialogContent className="max-w-2xl">
				<AlertDialogHeader>
					<AlertDialogTitle>Workspace Members</AlertDialogTitle>
					<AlertDialogDescription>View workspace members.</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-4 py-4">
					<div className="max-h-96 overflow-y-auto">
						{members.length === 0 ? (
							<div className="text-muted-foreground py-4 text-center">
								No members yet
							</div>
						) : (
							<div className="space-y-2">
								{members.map((member) => (
									<ViewMemberRow
										key={`${member.workspaceId}-${member.userId}`}
										member={member}
									/>
								))}
							</div>
						)}
					</div>
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>Close</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export { ViewMembersDialog };
