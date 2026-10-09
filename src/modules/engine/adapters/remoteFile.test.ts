import { afterEach, describe, expect, it, vi } from "vitest";
import { createRemoteFile } from "./remoteFile";
import { MAX_MPQ_SIZE } from "constants/files";

afterEach(() => vi.unstubAllGlobals());

describe("remote archive", () => {
	it("reads arbitrary ranges across chunks without changing bytes past EOF", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([0, 1]));
				controller.enqueue(new Uint8Array([]));
				controller.enqueue(new Uint8Array([2, 3, 4]));
				controller.enqueue(new Uint8Array([5]));
				controller.close();
			},
		});
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
		const file = await createRemoteFile("/spawn.mpq");
		expect(file.byteLength).toBe(6);
		for (let offset = 0; offset <= 7; offset++) {
			const target = new Uint8Array(4).fill(99);
			file.readInto(target, offset);
			const expected = Array.from({ length: 4 }, (_, i) => (offset + i < 6 ? offset + i : 99));
			expect([...target]).toEqual(expected);
		}
	});

	it("cancels an oversized response before reading it", async () => {
		const cancel = vi.fn();
		const stream = new ReadableStream<Uint8Array>({ cancel });
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(stream, {
					headers: { "Content-Length": String(MAX_MPQ_SIZE + 1) },
				})
			)
		);
		await expect(createRemoteFile("/spawn.mpq")).rejects.toThrow("too large");
		expect(cancel).toHaveBeenCalledOnce();
		expect(stream.locked).toBe(false);
	});
});
