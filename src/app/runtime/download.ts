export function downloadBlob(filename: string, blob: Blob): string {
	const fileUrl = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = fileUrl;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	return fileUrl;
}

export function revokeBlobUrl(url: string): void {
	URL.revokeObjectURL(url);
}
