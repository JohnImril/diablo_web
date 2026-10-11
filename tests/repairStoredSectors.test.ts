import { deflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { repairStoredSectors } from "../src/modules/mpqcmp/adapters/repairStoredSectors";

it("repairs zlib sectors whose stored length equals the raw length", async () => {
	let seed = 42;
	const bytes = Uint8Array.from({ length: 256 }, () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed >>> 24;
	});
	let raw: Uint8Array | undefined;
	let compressed: Uint8Array | undefined;
	for (let zeros = 1; zeros < 256; zeros++) {
		const candidate = bytes.slice();
		candidate.fill(0, 0, zeros);
		const encoded = Uint8Array.from([2, ...deflateSync(candidate)]);
		if (encoded.length === candidate.length) {
			raw = candidate;
			compressed = encoded;
			break;
		}
	}
	expect(raw).toBeDefined();
	const output = new Uint8Array(8 + compressed!.length);
	new DataView(output.buffer).setUint32(0, 8, true);
	new DataView(output.buffer).setUint32(4, output.length, true);
	output.set(compressed!, 8);
	await repairStoredSectors(output, new Uint32Array([0, output.length, raw!.length, 0x80000200]));
	expect(output.subarray(8)).toEqual(raw);
});

it("preserves raw sectors starting with byte 2 and skips sound output", async () => {
	const output = new Uint8Array([8, 0, 0, 0, 12, 0, 0, 0, 2, 9, 8, 7]);
	const original = output.slice();
	await repairStoredSectors(output, new Uint32Array([0, output.length, 4, 0x80000200]));
	expect(output).toEqual(original);
	await repairStoredSectors(output, new Uint32Array([0, output.length, output.length, 0x80000000]));
	expect(output).toEqual(original);
});
