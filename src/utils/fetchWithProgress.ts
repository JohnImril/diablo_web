export async function fetchWithProgress(
	url: string,
	onProgress?: (loaded: number, total?: number) => void,
	init?: RequestInit
): Promise<ArrayBufferLike> {
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

	const total = Number(res.headers.get("content-length") ?? 0);
	const reader = res.body?.getReader();
	if (!reader) throw new Error("Response body is null");

	let result: Uint8Array;
	let chunks: Uint8Array[] | null = null;

	if (total > 0) {
		result = new Uint8Array(total);
	} else {
		result = new Uint8Array(0);
		chunks = [];
	}

	let loaded = 0;
	let offset = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			if (total > 0) {
				result.set(value, offset);
				offset += value.length;
			} else {
				chunks!.push(value);
			}
			loaded += value.length;
			onProgress?.(loaded, total || undefined);
		}
	}

	if (total === 0 && chunks) {
		const size = chunks.reduce((sum, c) => sum + c.length, 0);
		result = new Uint8Array(size);
		let pos = 0;
		for (const chunk of chunks) {
			result.set(chunk, pos);
			pos += chunk.length;
		}
	}

	return result.buffer;
}
