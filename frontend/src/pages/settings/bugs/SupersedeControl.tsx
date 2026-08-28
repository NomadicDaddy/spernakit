import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import type { BugReport } from '@/api/types';

import { supersedeBug } from '@/api/bugs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SupersedeControlProps {
	bug: BugReport;
}

/**
 * Record which report replaces this one, or clear the link again.
 *
 * Clearing is offered alongside setting because a link filed against the wrong number would
 * otherwise be an uncorrectable mistake, which is the same class of problem this whole feature
 * exists to fix.
 *
 * The refusals the server can return are shown as they are written rather than reduced to a
 * generic failure: "a report cannot supersede itself" and "that report is already replaced by this
 * one" are two different mistakes, and the person making one needs to know which.
 */
function SupersedeControl({ bug }: SupersedeControlProps) {
	const queryClient = useQueryClient();
	const [value, setValue] = useState('');

	const mutation = useMutation({
		mutationFn: (reportId: null | number) => supersedeBug(bug.id, reportId),
		onError: (err) => {
			toast.error('Link Not Saved', {
				description: err instanceof Error ? err.message : 'Failed to record the link',
			});
		},
		onSuccess: (_result, reportId) => {
			setValue('');
			void queryClient.invalidateQueries({ queryKey: ['bugs'] });
			void queryClient.invalidateQueries({ queryKey: ['bug'] });
			toast.success(reportId === null ? 'Link Cleared' : 'Report Superseded', {
				description:
					reportId === null
						? `Report #${String(bug.id)} is open work again.`
						: `Report #${String(bug.id)} is now replaced by #${String(reportId)}.`,
			});
		},
	});

	const parsed = Number.parseInt(value, 10);
	const isValid = Number.isInteger(parsed) && parsed > 0;

	return (
		<div className="space-y-2">
			<h3 className="text-xs font-medium text-muted-foreground uppercase">Supersede</h3>
			<p className="text-xs text-muted-foreground">
				Point this report at the later one that replaces it. Nothing is deleted: this report
				keeps its text and stops appearing as separate open work in the inbox.
			</p>
			<div className="flex flex-wrap items-end gap-2">
				<div className="space-y-1">
					<Label className="text-xs" htmlFor={`supersede-${String(bug.id)}`}>
						Replaced by report #
					</Label>
					<Input
						className="w-32"
						disabled={mutation.isPending}
						id={`supersede-${String(bug.id)}`}
						inputMode="numeric"
						onChange={(e) => {
							setValue(e.target.value);
						}}
						placeholder="e.g. 42"
						value={value}
					/>
				</div>
				<Button
					disabled={!isValid || mutation.isPending}
					onClick={() => {
						mutation.mutate(parsed);
					}}
					type="button">
					Save link
				</Button>
				{bug.supersededById === null ? null : (
					<Button
						disabled={mutation.isPending}
						onClick={() => {
							mutation.mutate(null);
						}}
						type="button"
						variant="outline">
						Clear link
					</Button>
				)}
			</div>
		</div>
	);
}

export { SupersedeControl };
