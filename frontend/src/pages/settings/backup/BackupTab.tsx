import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Database, Download, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { getBackupStatus, restoreBackup, triggerBackup, type BackupFile } from '@/api/backup';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useFormatters } from '@/hooks/useFormatters';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatBytes } from '@/lib/formatters';

const BACKUPS_PER_PAGE = 20;

interface BackupListProps {
	backups: BackupFile[];
	canRestore: boolean;
	onPageChange: (page: number) => void;
	onRestore: (backup: BackupFile) => void;
	page: number;
	restoring: boolean;
}

function BackupList({
	backups,
	canRestore,
	onPageChange,
	onRestore,
	page,
	restoring,
}: BackupListProps) {
	const { formatDateTime } = useFormatters();
	if (backups.length === 0) {
		return <p className="text-muted-foreground text-sm">No backups available</p>;
	}

	const totalPages = Math.ceil(backups.length / BACKUPS_PER_PAGE);
	const safePage = Math.min(page, totalPages);
	const start = (safePage - 1) * BACKUPS_PER_PAGE;
	const visible = backups.slice(start, start + BACKUPS_PER_PAGE);

	return (
		<div className="space-y-3">
			<div className="space-y-2">
				{visible.map((backup) => (
					<div
						className="flex items-center justify-between rounded-md border p-3"
						key={backup.filename}>
						<div className="flex items-center gap-3">
							<Database aria-hidden="true" className="text-muted-foreground size-4" />
							<div>
								<p className="text-sm font-medium">{backup.filename}</p>
								<p className="text-muted-foreground text-xs">
									{formatDateTime(backup.timestamp)}
									{' — '}
									{formatBytes(backup.sizeBytes)}
								</p>
							</div>
						</div>
						{canRestore && (
							<Button
								disabled={restoring}
								onClick={() => onRestore(backup)}
								size="sm"
								variant="outline">
								<RotateCcw aria-hidden="true" className="mr-1 size-3" />
								Restore
							</Button>
						)}
					</div>
				))}
			</div>
			{totalPages > 1 && (
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">
						Page {safePage} of {totalPages} ({backups.length} backups)
					</span>
					<div className="flex gap-2">
						<Button
							disabled={safePage <= 1}
							onClick={() => onPageChange(safePage - 1)}
							size="sm"
							variant="outline">
							<ChevronLeft aria-hidden="true" className="mr-1 size-3" />
							Previous
						</Button>
						<Button
							disabled={safePage >= totalPages}
							onClick={() => onPageChange(safePage + 1)}
							size="sm"
							variant="outline">
							Next
							<ChevronRight aria-hidden="true" className="ml-1 size-3" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

export function BackupTab() {
	const { can } = useAuthorization();
	const canManageBackups = can('ADMIN');
	const canRestore = can('SYSOP');
	const queryClient = useQueryClient();
	const { formatDateTime } = useFormatters();
	const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null);
	const { getFilter, setFilters } = useUrlFilters();
	const parsedPage = Number(getFilter('backupPage', '1'));
	const requestedPage = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;

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
				setFilters(
					(params) => {
						params.delete('backupPage');
					},
					{ replace: false }
				);
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

	if (!canManageBackups) {
		return (
			<div className="flex h-[40vh] items-center justify-center">
				<div className="text-center">
					<h2 className="text-h2">Access Denied</h2>
					<p className="text-muted-foreground mt-2">
						You need ADMIN role or higher to manage backups.
					</p>
				</div>
			</div>
		);
	}

	const backups = data?.backups ?? [];
	const totalPages = Math.max(1, Math.ceil(backups.length / BACKUPS_PER_PAGE));
	const page = requestedPage > totalPages ? 1 : requestedPage;
	const setPage = (nextPage: number) => {
		setFilters(
			(params) => {
				if (nextPage <= 1) {
					params.delete('backupPage');
				} else {
					params.set('backupPage', String(nextPage));
				}
			},
			{ replace: false }
		);
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<Database aria-hidden="true" className="size-5" />
								Database Backups
							</CardTitle>
							<CardDescription>
								Manage database backups and restore points
							</CardDescription>
						</div>
						<Button
							disabled={triggerMutation.isPending}
							onClick={() => triggerMutation.mutate()}>
							<Download aria-hidden="true" className="mr-2 size-4" />
							{triggerMutation.isPending ? 'Creating…' : 'Create Backup'}
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<div className="mb-4 flex items-center gap-4 text-sm">
						<span className="text-muted-foreground">Last backup:</span>
						<span className="font-medium">
							{data?.lastBackup?.timestamp
								? formatDateTime(data.lastBackup.timestamp)
								: 'Never'}
						</span>
						{data?.lastBackup && (
							<Badge variant="outline">
								{formatBytes(data.lastBackup.sizeBytes)}
							</Badge>
						)}
					</div>

					<BackupList
						backups={backups}
						canRestore={canRestore}
						onPageChange={setPage}
						onRestore={setRestoreTarget}
						page={page}
						restoring={restoreMutation.isPending}
					/>
				</CardContent>
			</Card>

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
			/>
		</div>
	);
}
