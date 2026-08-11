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
			{/* Same two corrections as ManageMembersDialog: the width goes through the component's
			    own size API, which `max-w-2xl` lost the cascade to, and the body drops the `py-4`
			    that doubled the content grid's own 16px gap on both seams. */}
			<AlertDialogContent size="lg">
				<AlertDialogHeader>
					<AlertDialogTitle>Workspace Members</AlertDialogTitle>
					<AlertDialogDescription>View workspace members.</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-4">
					<div className="max-h-96 overflow-y-auto">
						{members.length === 0 ? (
							<div className="py-4 text-center text-muted-foreground">
								No members yet
							</div>
						) : (
							<div className="divide-y divide-border/60 overflow-hidden rounded-lg border">
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
