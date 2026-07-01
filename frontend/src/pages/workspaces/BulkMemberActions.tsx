import { Trash2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface BulkMemberActionsProps {
	bulkIsPending: { add: boolean; remove: boolean };
	onBulkAdd: () => void;
	onBulkRemove: () => void;
	onClearSelection: () => void;
	roleName: string;
	selectedCount: number;
}

function BulkMemberActions({
	bulkIsPending,
	onBulkAdd,
	onBulkRemove,
	onClearSelection,
	roleName,
	selectedCount,
}: BulkMemberActionsProps) {
	if (selectedCount === 0) return null;

	return (
		<div className="flex gap-2">
			<Button disabled={bulkIsPending.add} onClick={onBulkAdd} variant="outline">
				<Users aria-hidden="true" className="mr-2 size-4" />
				Add {selectedCount} with {roleName}
			</Button>
			<Button disabled={bulkIsPending.remove} onClick={onBulkRemove} variant="destructive">
				<Trash2 aria-hidden="true" className="mr-2 size-4" />
				Remove {selectedCount}
			</Button>
			<Button onClick={onClearSelection} variant="ghost">
				Clear selection
			</Button>
		</div>
	);
}

export { BulkMemberActions };
