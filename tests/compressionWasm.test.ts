import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { inflateSync } from "node:zlib";
import { expect, it } from "vitest";

it("compresses and round-trips multiple 64 KiB output sectors with the shipped WASM", async () => {
	const sourceUrl = new URL("../src/modules/mpqcmp/adapters/mpqCmp.jscc", import.meta.url);
	const source = readFileSync(sourceUrl, "utf8")
		.replaceAll("import.meta.url", JSON.stringify(sourceUrl.href))
		.replace("export default MpqCmp;", "");
	const input = Uint8Array.from({ length: 150000 }, (_, i) => (i * 17 + (i >> 8)) & 255);
	let output = new Uint8Array();
	const factory = runInNewContext(`${source}; MpqCmp`, {
		WebAssembly,
		URL,
		TextDecoder,
		console,
		performance,
		setTimeout,
		clearTimeout,
		self: {
			DApi: {
				get_file_contents: (array: Uint8Array, offset: number) =>
					array.set(input.subarray(offset, offset + array.length)),
				put_file_size: (size: number) => {
					output = new Uint8Array(size);
				},
				put_file_contents: (array: Uint8Array, offset: number) => output.set(array, offset),
				exit_error: (message: string) => {
					throw new Error(message);
				},
				progress: () => {},
			},
		},
	});
	const wasm = await factory({
		wasmBinary: readFileSync(new URL("../src/modules/mpqcmp/adapters/mpqCmp.wasm", import.meta.url)),
	});
	wasm.prepareCompressionStack();
	const entries = new Uint32Array([0, input.length, input.length, 0x80000000, 0, 0]);
	const ptr = wasm._DApi_Alloc(entries.byteLength);
	wasm.HEAPU32.set(entries, ptr >>> 2);
	const dst = wasm._DApi_Compress(input.length, 4096, 1, ptr) >>> 2;
	wasm.checkCompressionStack();
	expect(wasm.HEAPU32[dst + 2]).toBe(input.length);
	const sectorCount = Math.ceil(input.length / 65536);
	const offsets = new Uint32Array(output.buffer, 0, sectorCount + 1);
	const decoded: Uint8Array[] = [];
	for (let i = 0; i < sectorCount; i++) {
		const sector = output.subarray(offsets[i], offsets[i + 1]);
		const size = Math.min(65536, input.length - i * 65536);
		if (sector.length === size) decoded.push(sector);
		else {
			expect(sector[0]).toBe(2); // MPQ zlib compression mask
			decoded.push(inflateSync(sector.subarray(1)));
		}
	}
	expect(Buffer.concat(decoded)).toEqual(Buffer.from(input));
});
