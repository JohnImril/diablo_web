// MPQ treats a sector whose stored size equals its original size as raw data.
// The bundled compressor can emit zlib data of exactly that size instead.
// Convert those ambiguous sectors back to raw bytes, preserving all offsets.
export async function repairStoredSectors(output: Uint8Array<ArrayBuffer>, blocks: Uint32Array) {
	for (let i = 0; i < blocks.length; i += 4) {
		const [offset, storedSize, fileSize, flags] = blocks.subarray(i, i + 4);
		if (!(flags & 0x200)) continue;
		const sectors = Math.ceil(fileSize / 65536);
		const view = new DataView(output.buffer, output.byteOffset + offset, storedSize);
		for (let j = 0; j < sectors; j++) {
			const start = view.getUint32(j * 4, true);
			const end = view.getUint32((j + 1) * 4, true);
			const size = Math.min(65536, fileSize - j * 65536);
			if (end - start !== size || output[offset + start] !== 2) continue;
			let decoded: ArrayBuffer;
			try {
				const stream = new Blob([output.slice(offset + start + 1, offset + end)])
					.stream()
					.pipeThrough(new DecompressionStream("deflate"));
				decoded = await new Response(stream).arrayBuffer();
			} catch {
				// A genuine raw sector may start with the zlib mask byte.
				continue;
			}
			if (decoded.byteLength === size) output.set(new Uint8Array(decoded), offset + start);
		}
	}
}
