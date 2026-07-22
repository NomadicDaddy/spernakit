import type { Dispatch, SetStateAction } from 'react';

import { Save } from 'lucide-react';

import { FileUpload } from '@/components/shared/FileUpload';
import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BrandingFormData {
	accentColor: string;
	logoFileId: null | number;
}

interface WorkspaceBrandingTabProps {
	form: BrandingFormData;
	isPending: boolean;
	isUploading: boolean;
	onSave: () => void;
	onUpload: (file: File) => void;
	setForm: Dispatch<SetStateAction<BrandingFormData>>;
}

function WorkspaceBrandingTab({
	form,
	isPending,
	isUploading,
	onSave,
	onUpload,
	setForm,
}: WorkspaceBrandingTabProps) {
	return (
		<div className="max-w-lg space-y-4">
			<div className="space-y-2">
				<Label htmlFor="ws-settings-logo">Workspace Logo</Label>
				{form.logoFileId !== null ? (
					<div className="flex items-center gap-3">
						<img
							alt="Workspace logo"
							className="h-12 w-12 rounded-md border object-contain"
							height={48}
							src={`/api/v1/files/${form.logoFileId}`}
							width={48}
						/>
						<Button
							onClick={() =>
								setForm((prev) => ({
									...prev,
									logoFileId: null,
								}))
							}
							size="sm"
							variant="outline">
							Remove
						</Button>
					</div>
				) : (
					<FileUpload
						accept="image/*"
						isPending={isUploading}
						maxSizeBytes={2 * 1024 * 1024}
						onFileSelect={onUpload}
					/>
				)}
				<p className="text-muted-foreground text-xs">
					Upload a logo for this workspace (max 2 MB, image files only).
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="ws-settings-accent-color">Accent Color</Label>
				<div className="flex items-center gap-3">
					<input
						className="h-10 w-14 cursor-pointer rounded border"
						id="ws-settings-accent-color"
						onChange={(e) =>
							setForm((prev) => ({
								...prev,
								accentColor: e.target.value,
							}))
						}
						type="color"
						value={form.accentColor}
					/>
					<Input
						aria-label="Accent color hex value"
						autoComplete="off"
						className="w-32"
						maxLength={7}
						onChange={(e) =>
							setForm((prev) => ({
								...prev,
								accentColor: e.target.value,
							}))
						}
						pattern="^#[0-9A-Fa-f]{6}$"
						spellCheck={false}
						value={form.accentColor}
					/>
				</div>
				<p className="text-muted-foreground text-xs">
					Primary accent color for this workspace&apos;s branding.
				</p>
			</div>

			<Button disabled={isPending} onClick={onSave}>
				{isPending ? (
					<Spinner className="mr-2" size={16} />
				) : (
					<Save className="mr-2 h-4 w-4" />
				)}
				Save Branding
			</Button>
		</div>
	);
}

export { WorkspaceBrandingTab };
export type { BrandingFormData };
