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

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				chunks.push(value);
				loaded += value.length;
				onProgress?.(loaded, total);
			}
		}
	} catch (error) {
		await reader.cancel().catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}

	const result = new Uint8Array(loaded);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result.buffer;
}

// Restart interrupted downloads from scratch; never combine bytes from different responses.
export async function fetchWithProgressRetry(
	url: string,
	onProgress?: (loaded: number, total?: number) => void
): Promise<ArrayBuffer> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fetchWithProgress(url, onProgress, attempt ? { cache: "reload" } : undefined);
		} catch (error) {
			if (!(error instanceof TypeError)) throw error;
			if (attempt === 2) {
				throw new Error(`Failed to download ${url} after 3 attempts. Check your connection and try again.`, {
					cause: error,
				});
			}
			await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
			onProgress?.(0, 0);
		}
	}
}
