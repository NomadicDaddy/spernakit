import { FileUp, X } from 'lucide-react';
import { useImperativeHandle, useRef, useState } from 'react';

import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * What a page-level trigger can do to this component.
 *
 * A surface whose primary action is "upload" needs a real primary Button in its `PageHeader`, but
 * the file input, the size validation and the selected-file confirmation row all live in here. So
 * the header button opens this component's picker rather than growing a second upload path with
 * its own, inevitably divergent, validation.
 */
interface FileUploadHandle {
	/** Open the native file picker, as clicking the drop zone does. */
	open: () => void;
}

interface FileUploadProps {
	/** Accepted file types (MIME patterns for the input accept attribute) */
	accept?: string;
	/** Additional className for the drop zone container */
	className?: string;
	/** Whether the upload action is disabled */
	disabled?: boolean;
	/** Whether an upload is currently in progress */
	isPending?: boolean;
	/**
	 * Id of the element that names this drop zone — usually the field's visible `Label`.
	 *
	 * Without it the zone's only accessible name is the generic "File upload drop zone", which
	 * says what the control is but not what it is for; a form with two of them is two identically
	 * named buttons. A `<Label htmlFor>` cannot do this job because the zone is a `<button>` the
	 * label has no id to point at, which is how one call site ended up labelling nothing at all.
	 */
	labelledBy?: string;
	/** Maximum file size in bytes (client-side validation) */
	maxSizeBytes?: number;
	/** Called when a valid file is selected or dropped */
	onFileSelect: (file: File) => void;
	/** Imperative handle for a trigger rendered outside this component. */
	ref?: React.Ref<FileUploadHandle>;
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
	labelledBy,
	maxSizeBytes,
	onFileSelect,
	ref,
}: FileUploadProps) {
	const [dragOver, setDragOver] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [sizeError, setSizeError] = useState<null | string>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useImperativeHandle(ref, () => ({ open: () => inputRef.current?.click() }), []);

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
			{/*
			 * Three things this zone did not do. It was intrinsically sized, so a 342px target sat
			 * flush-left inside a centred wrapper up to 768px wide and drifted further off the card's
			 * centre axis as the viewport grew — `w-full` makes it fill the width its wrapper was
			 * already given. It carried the app's only 2px border, on a page whose every other edge
			 * is 1px, so the loudest element on a restrained surface was a dashed rectangle — the
			 * `bg-muted/30` fill now carries the affordance the extra pixel was doing. And as the
			 * primary control on its surface it was the one element still falling back to the UA's
			 * focus outline instead of the app's ring.
			 */}
			<button
				aria-label={
					labelledBy ? undefined : 'File upload drop zone - click or drag a file here'
				}
				aria-labelledby={labelledBy}
				className={cn(
					'flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 transition-colors',
					'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
					dragOver && isInteractive
						? 'border-primary bg-primary/5'
						: 'border-border/60 bg-muted/30 hover:border-muted-foreground/50',
					!isInteractive && 'cursor-not-allowed opacity-50',
				)}
				disabled={!isInteractive}
				onClick={() => inputRef.current?.click()}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
				type="button">
				<FileUp aria-hidden className="mb-2 size-8 text-muted-foreground" />
				<p className="text-sm text-muted-foreground">
					Drag and drop a file here, or click to browse
				</p>
				{maxSizeBytes && (
					<p className="mt-1 text-xs text-muted-foreground/70">
						Maximum size: {formatFileSize(maxSizeBytes)}
					</p>
				)}
			</button>

			<input
				accept={accept}
				className="hidden"
				onChange={handleInputChange}
				ref={inputRef}
				type="file"
			/>

			{sizeError && (
				<p aria-live="polite" className="text-sm text-destructive" role="alert">
					{sizeError}
				</p>
			)}

			{selectedFile && !sizeError && (
				<div className="flex items-center justify-between rounded-md border px-3 py-2">
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium">{selectedFile.name}</p>
						<p className="text-xs text-muted-foreground">
							{formatFileSize(selectedFile.size)}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button disabled={isPending} onClick={handleUpload} size="sm">
							{isPending ? (
								<>
									<Spinner size={12} />
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
export type { FileUploadHandle, FileUploadProps };
