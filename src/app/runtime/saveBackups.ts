import { isSaveFile } from "../../modules/storage/core/saveRules";

export function createSaveBackups(files: Map<string, Uint8Array>) {
	const saves: { name: string; data: Uint8Array }[] = [];
	for (const [name, data] of files) {
		if (isSaveFile(name)) saves.push({ name, data });
	}
	return saves
		.sort((a, b) => a.name.localeCompare(b.name))
		.map(({ name, data }) => ({
			name,
			// Blob snapshots the view, so an extra byte copy is unnecessary for ordinary ArrayBuffers.
			blob: new Blob(
				[
					data.buffer instanceof ArrayBuffer
						? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
						: data.slice().buffer,
				],
				{ type: "application/octet-stream" }
			),
		}));
}
