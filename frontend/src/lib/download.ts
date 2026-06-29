/**
 * Triggers a browser download for a given blob.
 *
 * Creates a temporary object URL and anchor element to initiate the download,
 * then cleans up both after the download starts.
 *
 * @param blob - The blob to download
 * @param fileName - The name to save the file as
 */
export function downloadBlob(blob: Blob, fileName: string): void {
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	a.style.display = 'none';
	document.body.appendChild(a);
	a.click();
	// Defer cleanup to avoid revoking the URL before the browser starts the download
	setTimeout(() => {
		window.URL.revokeObjectURL(url);
		document.body.removeChild(a);
	}, 100);
}
