import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import type { FileUploadHandle } from '@/components/shared/FileUpload';

import { ApiError } from '@/api/apiError';
import { showErrorToast } from '@/api/errorHandling';
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
import { useLayoutStore } from '@/stores/layoutStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/** The server's own per-file ceiling, stated once so the header trigger and the drop zone agree. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/*
 * The types the server accepts, restated for the file picker the way MAX_UPLOAD_BYTES restates
 * the size ceiling. The authority is `storage.allowedMimeTypes` in the app's config file, which
 * is only readable through the SYSOP-only runtime-config endpoint, so an OPERATOR uploading a
 * file cannot be told the list by the server. `FileUpload` defaults `accept` to `*`, and this
 * page never overrode it: the picker offered every file on the machine against a server that
 * takes eight types, so choosing anything else looked like a working upload right until nothing
 * happened.
 *
 * Drift between this list and the config is not silent — a refused upload now says why, below —
 * so the picker narrows the common case and the message covers the rest.
 */
const ACCEPTED_UPLOAD_TYPES = [
	'application/json',
	'application/pdf',
	'image/gif',
	'image/jpeg',
	'image/png',
	'image/webp',
	'text/csv',
	'text/plain',
].join(',');

/** The one status `showErrorToast` leaves to the caller. */
const HTTP_BAD_REQUEST = 400;

function FilesPage() {
	const queryClient = useQueryClient();
	/*
	 * This page reaches `usePagination` directly rather than through `useUrlFilters`, so it
	 * has to read the rows-per-page preference itself; hardcoding 20 here would leave /files
	 * as the one paginated surface that ignored the setting.
	 */
	const itemsPerPage = useLayoutStore((s) => s.itemsPerPage);
	const { limit, page, setLimit, setPage } = usePagination(itemsPerPage, true);
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
		/*
		 * Upload rejections come back as 400, and 400 is the one status the app-wide handler
		 * deliberately leaves alone: `showErrorToast` skips it so a generic message cannot bury a
		 * field-specific one, on the understanding that the mutation supplies its own. This one
		 * never did, so a refused upload rendered nothing at all — and `FileUpload` clears the
		 * staged file the moment it hands it over, so the file went too. A rejection was
		 * indistinguishable from a click that did nothing.
		 *
		 * The server's message is the useful part of a rejection ("MIME type 'video/mp4' is not
		 * allowed", "File exceeds maximum size of 10MB"). It is written by the upload's own
		 * validation and names nothing internal, so it is shown as written.
		 *
		 * Every other status is handed back to `showErrorToast`. Declaring `onError` at all opts
		 * this mutation out of the MutationCache's global toast, so without this line an expired
		 * session or a 500 during an upload would lose its app-wide wording to a local guess.
		 */
		onError: (error) => {
			if (!(error instanceof ApiError)) {
				toast.error('Upload failed. Please try again.');
				return;
			}
			if (error.status === HTTP_BAD_REQUEST) toast.error(error.message);
			else showErrorToast(error.status, error.code, error.details);
		},
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
					accept={ACCEPTED_UPLOAD_TYPES}
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
								accept={ACCEPTED_UPLOAD_TYPES}
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
