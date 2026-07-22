import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { deleteFile, downloadFile, type FileRecord, listFiles, uploadFile } from '@/api/files';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { FileUpload } from '@/components/shared/FileUpload';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useFileColumns } from '@/hooks/useFileColumns';
import { usePagination } from '@/hooks/usePagination';
import { downloadBlob } from '@/lib/download';
import { useWorkspaceStore } from '@/stores/workspaceStore';

function FilesPage() {
	const queryClient = useQueryClient();
	const { limit, page, setLimit, setPage } = usePagination(20, true);
	const [downloadingId, setDownloadingId] = useState<null | number>(null);
	const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null);
	const { user } = useAuth();
	const { can: canManageFiles } = useAuthorization();
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

	const { data: filesData, isLoading } = useQuery({
		enabled: !!user && activeWorkspaceId !== null,
		queryFn: () => listFiles({ limit: String(limit), page: String(page) }),
		queryKey: ['files', activeWorkspaceId, page, limit],
	});

	const uploadMutation = useMutation({
		mutationFn: (file: File) => uploadFile(file),
		onSuccess: () => {
			toast.success('File uploaded successfully');
			void queryClient.invalidateQueries({ queryKey: ['files', activeWorkspaceId] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => deleteFile(id),
		onSuccess: () => {
			toast.success('File deleted successfully');
			setDeleteTarget(null);
			void queryClient.invalidateQueries({ queryKey: ['files', activeWorkspaceId] });
		},
	});

	async function handleDownload(id: number, fileName: string) {
		if (downloadingId !== null) return;
		setDownloadingId(id);
		try {
			const blob = await downloadFile(id);
			downloadBlob(blob, fileName);
		} catch {
			// Error toast already shown by apiClient.handleResponse()
		} finally {
			setDownloadingId(null);
		}
	}

	const columns = useFileColumns({
		canDelete: canManageFiles('OPERATOR'),
		downloadingId,
		isActionDisabled: deleteMutation.isPending || downloadingId !== null,
		onDelete: setDeleteTarget,
		onDownload: (id, fileName) => void handleDownload(id, fileName),
	});

	if (!user) {
		return (
			<div className="space-y-6 p-6">
				<EmptyState
					description="Please log in to access the file management page."
					icon={FileText}
					title="Authentication required"
				/>
			</div>
		);
	}

	const files = filesData?.data ?? [];
	const total = filesData?.total ?? 0;

	return (
		<div className="space-y-6 p-6">
			<PageHeader description="Upload and manage files for your workspace" title="Files" />

			{canManageFiles('OPERATOR') && (
				<FileUpload
					isPending={uploadMutation.isPending}
					maxSizeBytes={10 * 1024 * 1024}
					onFileSelect={(file) => uploadMutation.mutate(file)}
				/>
			)}

			{isLoading ? (
				<TableSkeleton />
			) : files.length === 0 ? (
				<EmptyState
					description="Upload files to get started."
					icon={FileText}
					title="No files uploaded yet"
				/>
			) : (
				<DataTable
					columns={columns}
					data={files}
					pagination={{
						limit,
						onPageChange: setPage,
						onPageSizeChange: setLimit,
						page,
						total,
					}}
				/>
			)}

			<ConfirmAlertDialog
				confirmText="Delete"
				description={`Are you sure you want to delete "${deleteTarget?.originalName}"? This action cannot be undone.`}
				isOpen={deleteTarget !== null}
				isPending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
				}}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				title="Delete File"
			/>
		</div>
	);
}

export { FilesPage };
