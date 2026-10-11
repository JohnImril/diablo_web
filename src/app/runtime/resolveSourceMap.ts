export const MAX_SOURCE_MAP_BYTES = 5 * 1024 * 1024;

// Vite emits external maps next to each hashed JavaScript asset.
export async function resolveSourceMap(uri: string, assetBase: string, signal: AbortSignal): Promise<string | null> {
	try {
		const base = new URL(assetBase);
		const source = new URL(uri, base);
		if (
			source.origin !== base.origin ||
			!source.pathname.startsWith(base.pathname) ||
			!source.pathname.endsWith(".js")
		)
			return null;
		source.search = "";
		source.hash = "";
		source.pathname += ".map";
		const response = await fetch(source, { signal, credentials: "omit", redirect: "error" });
		if (!response.ok || !response.body) return null;
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let size = 0;
		let text = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) return text + decoder.decode();
				size += value.byteLength;
				if (size > MAX_SOURCE_MAP_BYTES) {
					await reader.cancel();
					return null;
				}
				text += decoder.decode(value, { stream: true });
			}
		} finally {
			reader.releaseLock();
		}
	} catch {
		return null;
	}
}
