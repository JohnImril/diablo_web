import { clickDownloadLink } from "../../shared/download";

export function downloadBlob(filename: string, blob: Blob): string {
	const fileUrl = URL.createObjectURL(blob);
	clickDownloadLink(fileUrl, filename);
	return fileUrl;
}

export function revokeBlobUrl(url: string): void {
	URL.revokeObjectURL(url);
}
