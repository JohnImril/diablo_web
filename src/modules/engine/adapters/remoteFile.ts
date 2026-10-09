import { MAX_MPQ_SIZE } from "constants/files";

// Keep streamed archive chunks and copy requested ranges directly into WASM.
// This avoids allocating a second buffer the size of the entire archive.
export async function createRemoteFile(url: string) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to load remote file: ${response.status}`);
	const chunks: { offset: number; bytes: Uint8Array }[] = [];
	let byteLength = 0;
	const reader = response.body?.getReader();
	try {
		if (Number(response.headers.get("Content-Length") || 0) > MAX_MPQ_SIZE)
			throw new Error("Remote file is too large");
		if (!reader) throw new Error("Remote file response has no body");
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (byteLength + value.byteLength > MAX_MPQ_SIZE) throw new Error("Remote file is too large");
			if (value.byteLength) chunks.push({ offset: byteLength, bytes: value });
			byteLength += value.byteLength;
		}
	} catch (error) {
		if (reader) await reader.cancel().catch(() => {});
		else await response.body?.cancel().catch(() => {});
		throw error;
	} finally {
		reader?.releaseLock();
	}
	return {
		byteLength,
		readInto(target: Uint8Array, offset: number) {
			if (offset < 0 || !Number.isSafeInteger(offset)) throw new RangeError("Invalid archive offset");
			// Find the first chunk whose end lies after the requested offset.
			let low = 0;
			let high = chunks.length;
			while (low < high) {
				const mid = (low + high) >>> 1;
				const chunk = chunks[mid];
				if (chunk.offset + chunk.bytes.byteLength <= offset) low = mid + 1;
				else high = mid;
			}
			const end = Math.min(byteLength, offset + target.byteLength);
			for (let i = low; i < chunks.length && chunks[i].offset < end; i++) {
				const { offset: start, bytes } = chunks[i];
				const from = Math.max(offset, start);
				const to = Math.min(end, start + bytes.byteLength);
				target.set(bytes.subarray(from - start, to - start), from - offset);
			}
		},
	};
}
