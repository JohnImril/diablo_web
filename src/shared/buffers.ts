export type AnyBuf = ArrayBuffer | ArrayBufferLike | Uint8Array<ArrayBufferLike>;

export function toArrayBuffer(input: AnyBuf): ArrayBuffer {
	if (input instanceof ArrayBuffer) return input;
	const view = input instanceof Uint8Array ? input : new Uint8Array(input);
	return view.slice().buffer;
}

export function toUint8(input: AnyBuf): Uint8Array<ArrayBufferLike> {
	return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export function readFileAsArrayBuffer(
	file: File,
	onProgress?: (event: ProgressEvent<EventTarget>) => void
): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(reader.error);
		reader.onabort = () => reject();
		if (onProgress) {
			reader.addEventListener("progress", onProgress);
		}
		reader.readAsArrayBuffer(file);
	});
}
