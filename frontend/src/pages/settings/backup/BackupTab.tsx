import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Clock, Database, HardDrive, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { type BackupFile, getBackupStatus, restoreBackup, triggerBackup } from '@/api/backup';
import { StatCard } from '@/components/shared/charts/StatCard';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useFormatters } from '@/hooks/useFormatters';
import { formatBytes } from '@/lib/formatters';

import { useBackupColumns } from './useBackupColumns';

export function BackupTab() {
	const { can } = useAuthorization();
	const canManageBackups = can('ADMIN');
	const canRestore = can('SYSOP');
	const queryClient = useQueryClient();
	const { formatDateTime, formatTimestamp } = useFormatters();
	const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null);

	const { data } = useQuery({
		enabled: canManageBackups,
		queryFn: async () => {
			const res = await getBackupStatus();
			return res.data;
		},
		queryKey: ['backup-status'],
		staleTime: 30_000,
	});

	const triggerMutation = useMutation({
		mutationFn: triggerBackup,
		onSuccess: (res) => {
			if (res.data.success) {
				toast.success('Backup created successfully');
				void queryClient.invalidateQueries({ queryKey: ['backup-status'] });
			} else {
				toast.error('Backup failed. Check available disk space and try again.');
			}
		},
	});

	const restoreMutation = useMutation({
		mutationFn: (backupPath: string) => restoreBackup(backupPath),
		onSuccess: (res) => {
			if (res.data.success) {
				if (res.data.warnings?.length) {
					for (const warning of res.data.warnings) {
						toast.warning(warning);
					}
				}
				toast.success('Database restored successfully. Restart may be required.');
			} else {
				toast.error('Restore failed. Verify the backup file is valid and try again.');
			}
		},
	});

	const columns = useBackupColumns({
		canRestore,
		onRestore: setRestoreTarget,
		restoring: restoreMutation.isPending,
	});

	if (!canManageBackups) {
		return (
			<div className="flex h-[40vh] items-center justify-center">
				<div className="text-center">
					<h2 className="text-h2">Access Denied</h2>
					<p className="mt-2 text-muted-foreground">
						You need ADMIN role or higher to manage backups.
					</p>
				</div>
			</div>
		);
	}

	const backups = data?.backups ?? [];
	const totalBytes = backups.reduce((sum, backup) => sum + backup.sizeBytes, 0);
	const latest = data?.lastBackup;

	return (
		/*
		 * No outer Card. This tab was the only one on the settings rail that wrapped its whole body
		 * in one — a card header restating the page header 21px above it, and sixteen bordered rows
		 * boxed inside a box. The rail's other tabs put a `SectionHeader` on the canvas and let the
		 * table's own shell be the only frame, which is what happens here.
		 */
		<div className="space-y-6">
			<SectionHeader
				description="Restore points written by the scheduled backup task, newest first."
				title="Database Backups"
			/>

			{/*
			 * What the strip above the list used to say was `Last backup: 08/09/2026 16:29
			 * [536.04 KB]` — a verbatim duplicate of the first row 30px below it. The three facts an
			 * operator actually wants before touching this surface are how recent the newest restore
			 * point is, how many exist, and what they cost on disk; the count in particular was only
			 * ever rendered inside a pagination line that stayed hidden below 20 backups.
			 */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<StatCard
					icon={<Clock aria-hidden="true" className="size-4" />}
					title="Latest backup"
					value={latest ? formatTimestamp(latest.timestamp) : 'Never'}
					{...(latest ? { subtitle: formatDateTime(latest.timestamp) } : {})}
				/>
				<StatCard
					icon={<Database aria-hidden="true" className="size-4" />}
					title="Restore points"
					value={backups.length}
				/>
				<StatCard
					icon={<HardDrive aria-hidden="true" className="size-4" />}
					title="Total size"
					value={formatBytes(totalBytes)}
				/>
			</div>

			{/*
			 * Client-side pagination — the `pagination` prop is deliberately omitted. The whole
			 * inventory arrives in one `getBackupStatus` response, so the table pages what it already
			 * holds. That also retires the `backupPage` URL param the hand-rolled pager carried: it
			 * only ever appeared above 20 records, and the search box now reaches a named file
			 * directly rather than by paging to it.
			 */}
			<DataTable
				columns={columns}
				data={backups}
				empty={{
					action: (
						<Button
							disabled={triggerMutation.isPending}
							onClick={() => triggerMutation.mutate()}
							size="sm">
							<Plus aria-hidden="true" className="size-4" />
							{triggerMutation.isPending ? 'Creating…' : 'Create Backup'}
						</Button>
					),
					description:
						'Nothing has been backed up yet. Create one now, or let the schedule take the first.',
					// The SectionHeader above the table owns the h2.
					headingLevel: 'h3',
					icon: Archive,
					// No `isFiltered`: the search box is `searchColumn`, a TanStack filter the table
					// already reads out of its own state.
					title: 'No backups yet',
				}}
				filterPlaceholder="Search backups…"
				searchColumn="filename"
				toolbarActions={
					/*
					 * `Plus`, not `Download`. This action creates a backup file server-side and
					 * downloads nothing, but it was the one download-shaped glyph on the page — the
					 * per-row Actions menu is where an actual download lives. The table exemplar
					 * /settings/users fronts its equivalent create action with `Plus`, so a create
					 * action on a table toolbar now looks the same in both places and the download
					 * glyph stays free for something that downloads.
					 */
					<Button
						disabled={triggerMutation.isPending}
						onClick={() => triggerMutation.mutate()}>
						<Plus aria-hidden="true" className="size-4" />
						{triggerMutation.isPending ? 'Creating…' : 'Create Backup'}
					</Button>
				}
			/>

			<ConfirmAlertDialog
				confirmText="Restore"
				description={
					<>
						This will replace the current database with the backup{' '}
						<strong>{restoreTarget?.filename}</strong>. This action is destructive and
						cannot be undone. Are you sure?
					</>
				}
				isOpen={restoreTarget !== null}
				isPending={restoreMutation.isPending}
				onConfirm={() => {
					if (restoreTarget) {
						restoreMutation.mutate(restoreTarget.filename);
						setRestoreTarget(null);
					}
				}}
				onOpenChange={(open) => {
					if (!open) setRestoreTarget(null);
				}}
				title="Restore Database"
				variant="destructive"
			/>
		</div>
	);
}
