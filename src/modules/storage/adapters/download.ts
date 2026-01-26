import { clickDownloadLink } from "../../../shared/download";

export const triggerDownload = (url: string, name: string) => {
	clickDownloadLink(url, name);
	URL.revokeObjectURL(url);
};

type BinaryData = ArrayBuffer | Uint8Array | Blob;

export const downloadFile = (name: string, data: BinaryData, mime = "binary/octet-stream") => {
	const blob =
		data instanceof Blob ? data : new Blob([data instanceof Uint8Array ? data.slice().buffer : data], { type: mime });
	const url = URL.createObjectURL(blob);
	triggerDownload(url, name);
};

export const downloadSaves = (
	names: string[],
	lookup: (name: string) => BinaryData | null
) => {
	for (const name of names) {
		const data = lookup(name);
		if (data) {
			downloadFile(name, data);
		} else {
			console.error(`File ${name} does not exist`);
		}
	}
};
