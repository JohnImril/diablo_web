const triggerDownload = (url: string, name: string) => {
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
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
