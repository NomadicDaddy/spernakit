import { useMutation } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { uploadFile } from '@/api/files';
import { FileUpload } from '@/components/shared/FileUpload';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useWorkspaceSettings } from './useWorkspaceSettings';

/** Fallback swatch when a workspace has never set one. */
const DEFAULT_ACCENT = '#6366f1';

/** The visible "Workspace Logo" label, which names the drop zone in place of a dangling `htmlFor`. */
const LOGO_LABEL_ID = 'ws-settings-logo-label';

function WorkspaceBrandingTab() {
	const { isPending, save, settings } = useWorkspaceSettings();
	const storedAccent = settings?.branding?.accentColor ?? DEFAULT_ACCENT;
	const storedLogoFileId = settings?.branding?.logoFileId ?? null;
	const [accentColor, setAccentColor] = useState(storedAccent);
	const [logoFileId, setLogoFileId] = useState<null | number>(storedLogoFileId);

	// Re-seed the draft when the stored branding arrives or changes — see WorkspaceGeneralTab.
	const [syncedFrom, setSyncedFrom] = useState(`${storedAccent} ${String(storedLogoFileId)}`);
	const storedKey = `${storedAccent} ${String(storedLogoFileId)}`;
	if (storedKey !== syncedFrom) {
		setSyncedFrom(storedKey);
		setAccentColor(storedAccent);
		setLogoFileId(storedLogoFileId);
	}

	const isDirty = accentColor !== storedAccent || logoFileId !== storedLogoFileId;

	const uploadMutation = useMutation({
		mutationFn: (file: File) => uploadFile(file),
		onError: () => {
			toast.error('Failed to upload logo', {
				description:
					'Check that the file is a valid image under the size limit and try again.',
			});
		},
		onSuccess: (response) => {
			setLogoFileId(response.data.id);
			toast.success('Logo uploaded successfully');
		},
	});

	return (
		<Card>
			{/* A named card — see the note in WorkspaceGeneralTab. */}
			<CardHeader>
				<CardTitle>Branding</CardTitle>
				<CardDescription>Logo and accent color shown to workspace members.</CardDescription>
			</CardHeader>
			<CardContent>
				{/* Two columns, matching the General tab — see the note there on the caps. */}
				<div className="grid gap-6 sm:grid-cols-2">
					<div className="space-y-2">
						{/*
						 * The label names the control through `aria-labelledby` rather than
						 * `htmlFor`. `htmlFor="ws-settings-logo"` pointed at an element that
						 * does not exist — FileUpload renders a `<button>` and a hidden file
						 * input, neither carrying that id — so the field's only visible name
						 * was associated with nothing and clicking it did nothing.
						 */}
						<Label id={LOGO_LABEL_ID}>Workspace logo</Label>
						{logoFileId !== null ? (
							<div
								aria-labelledby={LOGO_LABEL_ID}
								className="flex items-center gap-3"
								role="group">
								<img
									alt="Workspace logo"
									className="size-12 rounded-md border object-contain"
									height={48}
									src={`/api/v1/files/${String(logoFileId)}`}
									width={48}
								/>
								<Button
									onClick={() => setLogoFileId(null)}
									size="sm"
									variant="outline">
									Remove
								</Button>
							</div>
						) : (
							<FileUpload
								accept="image/*"
								isPending={uploadMutation.isPending}
								labelledBy={LOGO_LABEL_ID}
								maxSizeBytes={2 * 1024 * 1024}
								onFileSelect={(file) => uploadMutation.mutate(file)}
							/>
						)}
						{/*
						 * No helper line under the drop zone. It printed the 2 MB limit a second
						 * time about 30px below FileUpload's own "Maximum size: 2 MB" in a
						 * different type treatment, and opened by restating the label 105px above
						 * it. The type restriction is not lost with it: `accept="image/*"` gates
						 * the picker, so a non-image cannot be chosen in the first place.
						 */}
					</div>

					<div className="space-y-2">
						<Label htmlFor="ws-settings-accent-color">Accent color</Label>
						{/*
						 * `w-full`, so the row terminates on the card's right edge rather than
						 * stopping ~400px short of it. This cell held about 200px of controls in a
						 * 545px column while the drop zone opposite filled its own, which left the
						 * whole lower-right quadrant empty and the card visibly left-weighted at
						 * every desktop width. DisplayPreferences, the exemplar for this grid,
						 * gives every control `w-full` for the same reason.
						 */}
						<div className="flex w-full items-center gap-3">
							{/*
							 * The swatch is a field control, so it takes the field metrics:
							 * 36px tall on the 8px radius, with the input border colour. At
							 * `h-10 w-14 rounded border` it stood 4px taller than the hex Input
							 * beside it on a tighter radius, so the pair read as two different
							 * kinds of control rather than two halves of one.
							 */}
							<input
								className="h-9 w-14 cursor-pointer rounded-md border border-input"
								id="ws-settings-accent-color"
								onChange={(e) => setAccentColor(e.target.value)}
								type="color"
								value={accentColor}
							/>
							<Input
								aria-label="Accent color hex value"
								autoComplete="off"
								className="flex-1"
								maxLength={7}
								onChange={(e) => setAccentColor(e.target.value)}
								pattern="^#[0-9A-Fa-f]{6}$"
								spellCheck={false}
								value={accentColor}
							/>
						</div>
						{/*
						 * No helper under the swatch. "Primary accent color for this
						 * workspace's branding." restated the "Accent color" label directly
						 * above it. Neither field carries a helper now — the drop zone prints
						 * its own limit, and the label says the rest.
						 */}
					</div>
				</div>
			</CardContent>
			{/* The primary action in the footer slot — see the note in WorkspaceGeneralTab. */}
			<CardFooter>
				{/* "Save changes", dirty-gated — see the note in WorkspaceGeneralTab. */}
				<Button
					disabled={isPending || !isDirty}
					onClick={() =>
						save({
							branding: {
								accentColor,
								...(logoFileId !== null ? { logoFileId } : {}),
							},
						})
					}>
					{isPending ? (
						<Spinner size={16} />
					) : (
						<Save aria-hidden="true" className="size-4" />
					)}
					Save changes
				</Button>
			</CardFooter>
		</Card>
	);
}

export { WorkspaceBrandingTab };
