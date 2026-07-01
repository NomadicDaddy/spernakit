import { FileUp, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
	/** Accepted file types (MIME patterns for the input accept attribute) */
	accept?: string;
	/** Additional className for the drop zone container */
	className?: string;
	/** Whether the upload action is disabled */
	disabled?: boolean;
	/** Whether an upload is currently in progress */
	isPending?: boolean;
	/** Maximum file size in bytes (client-side validation) */
	maxSizeBytes?: number;
	/** Called when a valid file is selected or dropped */
	onFileSelect: (file: File) => void;
}

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

const numFmt1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function formatFileSize(bytes: number): string {
	if (bytes < BYTES_PER_KB) return `${bytes} B`;
	if (bytes < BYTES_PER_MB) return `${numFmt1.format(bytes / BYTES_PER_KB)} KB`;
	return `${numFmt1.format(bytes / BYTES_PER_MB)} MB`;
}

function FileUpload({
	accept = '*',
	className,
	disabled = false,
	isPending = false,
	maxSizeBytes,
	onFileSelect,
}: FileUploadProps) {
	const [dragOver, setDragOver] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [sizeError, setSizeError] = useState<null | string>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	function validateAndSelect(file: File) {
		setSizeError(null);
		if (maxSizeBytes && file.size > maxSizeBytes) {
			setSizeError(`File exceeds maximum size of ${formatFileSize(maxSizeBytes)}`);
			setSelectedFile(null);
			return;
		}
		setSelectedFile(file);
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (!disabled && !isPending) setDragOver(true);
	}

	function handleDragLeave(e: React.DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		setDragOver(false);
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		setDragOver(false);
		if (disabled || isPending) return;

		const file = e.dataTransfer.files[0];
		if (file) validateAndSelect(file);
	}

	function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) validateAndSelect(file);
		if (inputRef.current) inputRef.current.value = '';
	}

	function handleUpload() {
		if (selectedFile && !disabled && !isPending) {
			onFileSelect(selectedFile);
			setSelectedFile(null);
			setSizeError(null);
		}
	}

	function handleClear() {
		setSelectedFile(null);
		setSizeError(null);
	}

	const isInteractive = !disabled && !isPending;

	return (
		<div className={cn('space-y-3', className)}>
			<div
				aria-label="File upload drop zone — click or drag a file here"
				className={cn(
					'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
					dragOver && isInteractive
						? 'border-primary bg-primary/5'
						: 'border-muted-foreground/25 hover:border-muted-foreground/50',
					!isInteractive && 'cursor-not-allowed opacity-50'
				)}
				onClick={() => isInteractive && inputRef.current?.click()}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
				onKeyDown={(e) => {
					if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault();
						inputRef.current?.click();
					}
				}}
				role="button"
				tabIndex={isInteractive ? 0 : -1}>
				<FileUp aria-hidden className="text-muted-foreground mb-2 h-8 w-8" />
				<p className="text-muted-foreground text-sm">
					Drag and drop a file here, or click to browse
				</p>
				{maxSizeBytes && (
					<p className="text-muted-foreground/70 mt-1 text-xs">
						Maximum size: {formatFileSize(maxSizeBytes)}
					</p>
				)}
			</div>

			<input
				accept={accept}
				className="hidden"
				onChange={handleInputChange}
				ref={inputRef}
				type="file"
			/>

			{sizeError && (
				<p aria-live="polite" className="text-destructive text-sm" role="alert">
					{sizeError}
				</p>
			)}

			{selectedFile && !sizeError && (
				<div className="flex items-center justify-between rounded-md border px-3 py-2">
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium">{selectedFile.name}</p>
						<p className="text-muted-foreground text-xs">
							{formatFileSize(selectedFile.size)}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button disabled={isPending} onClick={handleUpload} size="sm">
							{isPending ? (
								<>
									<Spinner className="mr-1" size={12} />
									Uploading…
								</>
							) : (
								'Upload'
							)}
						</Button>
						{!isPending && (
							<Button
								aria-label="Clear file selection"
								onClick={handleClear}
								size="sm"
								variant="ghost">
								<X aria-hidden="true" className="h-4 w-4" />
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export { FileUpload };
export type { FileUploadProps };
