export async function fetchWithProgress(
	url: string,
	onProgress?: (loaded: number, total?: number) => void,
	init?: RequestInit
): Promise<ArrayBuffer> {
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

	const total = Number(res.headers.get("content-length") ?? 0);
	const reader = res.body?.getReader();
	if (!reader) throw new Error("Response body is null");

	const chunks: Uint8Array[] = [];
	let loaded = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			loaded += value.length;
			onProgress?.(loaded, total);
		}
	}

	const result = new Uint8Array(loaded);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result.buffer;
}
