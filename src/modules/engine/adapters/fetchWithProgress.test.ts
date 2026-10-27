import { afterEach, expect, it, vi } from "vitest";
import { fetchWithProgressRetry } from "./fetchWithProgress";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it("restarts an interrupted body without retaining partial bytes and releases the reader", async () => {
	vi.useFakeTimers();
	let reads = 0;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (reads++ === 0) controller.enqueue(new Uint8Array([99]));
			else controller.error(new TypeError("Load failed"));
		},
	});
	const fetchMock = vi.fn().mockResolvedValueOnce(new Response(stream))
		.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
	vi.stubGlobal("fetch", fetchMock);
	const progress = vi.fn();
	const result = fetchWithProgressRetry("/spawn.mpq", progress);
	await vi.runAllTimersAsync();
	expect([...new Uint8Array(await result)]).toEqual([1, 2, 3]);
	expect(fetchMock).toHaveBeenCalledTimes(2);
	expect(fetchMock).toHaveBeenLastCalledWith("/spawn.mpq", { cache: "reload" });
	expect(progress).toHaveBeenCalledWith(0, 0);
	expect(stream.locked).toBe(false);
});

it("stops after three network failures and retains the original cause", async () => {
	vi.useFakeTimers();
	const cause = new TypeError("Load failed");
	const fetchMock = vi.fn().mockRejectedValue(cause);
	vi.stubGlobal("fetch", fetchMock);
	const assertion = expect(fetchWithProgressRetry("/spawn.mpq")).rejects.toMatchObject({
		message: expect.stringContaining("after 3 attempts"), cause,
	});
	await vi.runAllTimersAsync();
	await assertion;
	expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("does not retry HTTP errors", async () => {
	const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
	vi.stubGlobal("fetch", fetchMock);
	await expect(fetchWithProgressRetry("/spawn.mpq")).rejects.toThrow("404");
	expect(fetchMock).toHaveBeenCalledOnce();
});
