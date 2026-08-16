import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import type { FileUploadHandle } from '@/components/shared/FileUpload';

import { deleteFile, downloadFile, type FileRecord, listFiles, uploadFile } from '@/api/files';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { FileUpload } from '@/components/shared/FileUpload';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useFileColumns } from '@/hooks/useFileColumns';
import { usePagination } from '@/hooks/usePagination';
import { downloadBlob } from '@/lib/download';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/** The server's own per-file ceiling, stated once so the header trigger and the drop zone agree. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function FilesPage() {
	const queryClient = useQueryClient();
	const { limit, page, setLimit, setPage } = usePagination(20, true);
	const uploadRef = useRef<FileUploadHandle>(null);
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
			<PageHeader description="Upload and manage files for your workspace" title="Files">
				{/*
				 * The surface had no primary action at all: an empty header actions row and, as the
				 * only way to act on the page, a dashed outline labelled in 14px muted text. Nothing
				 * carried the blue the rest of the app reserves for the main action. This opens the
				 * same picker the drop zone does — drag-and-drop stays the secondary path.
				 *
				 * Hidden below `md`, where `FileUpload` renders its own full-width "Choose files"
				 * button rather than a drop zone. Two primary buttons opening the same picker 232px
				 * apart is two targets for one action, and on a phone the pair filled a third of the
				 * screen. Every branch that hides this one still renders a `FileUpload`, so nothing
				 * is stranded: the surface keeps exactly one way to upload at every width.
				 */}
				{canManageFiles('OPERATOR') && (
					<Button
						className="hidden md:inline-flex"
						onClick={() => uploadRef.current?.open()}
						size="sm">
						<Upload aria-hidden="true" className="size-4" />
						Upload File
					</Button>
				)}
			</PageHeader>

			{canManageFiles('OPERATOR') && (isLoading || files.length > 0) && (
				<FileUpload
					isPending={uploadMutation.isPending}
					maxSizeBytes={MAX_UPLOAD_BYTES}
					onFileSelect={(file) => uploadMutation.mutate(file)}
					ref={uploadRef}
				/>
			)}

			{isLoading ? (
				<TableSkeleton />
			) : files.length === 0 && canManageFiles('OPERATOR') ? (
				/*
				 * The shared EmptyState, not a hand-built card. This branch used to render a solid
				 * panel with a centred CardHeader — no icon, and a title at 14px, the same size as
				 * the body copy it sat above — while the other no-files branch three lines below
				 * used EmptyState. One page shipped two empty-state languages. EmptyState's own
				 * docblock says it is for "whenever a page section would otherwise be a blank card
				 * or dashed placeholder", which is exactly this, and its `action` slot takes the
				 * drop zone so the nested panel disappears with it.
				 *
				 * `frame="none"` because putting the drop zone in that slot left a dashed rectangle
				 * inside a dashed rectangle with nothing between them — the two edges measured
				 * 1.033:1 and 1.05:1 against each other. The drop zone keeps the dash: it is the
				 * element the convention actually describes.
				 */
				<EmptyState
					action={
						<div className="mx-auto w-full max-w-3xl">
							<FileUpload
								isPending={uploadMutation.isPending}
								maxSizeBytes={MAX_UPLOAD_BYTES}
								onFileSelect={(file) => uploadMutation.mutate(file)}
								ref={uploadRef}
							/>
						</div>
					}
					className="w-full"
					description="Upload a file to get started."
					frame="none"
					icon={FileText}
					title="No files uploaded yet"
				/>
			) : files.length === 0 ? (
				<EmptyState
					description="No files are available in this workspace."
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
				description={`Are you sure you want to delete “${deleteTarget?.originalName}”? This action cannot be undone.`}
				isOpen={deleteTarget !== null}
				isPending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
				}}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				title="Delete File"
				variant="destructive"
			/>
		</div>
	);
}

export { FilesPage };
