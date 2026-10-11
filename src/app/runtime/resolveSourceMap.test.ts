import { afterEach, describe, expect, it, vi } from "vitest";
import { mapStackTrace } from "../../utils/stacktrace/mapStackTrace";
import { MAX_SOURCE_MAP_BYTES, resolveSourceMap } from "./resolveSourceMap";

const base = "https://example.com/diablo_web/assets/";
afterEach(() => vi.unstubAllGlobals());

describe("source map loading", () => {
	it("maps a production frame using the adjacent external map", async () => {
		const map = JSON.stringify({ version: 3, sources: ["src/game.ts"], names: [], mappings: "AAAA" });
		const fetchMock = vi.fn().mockResolvedValue(new Response(map));
		vi.stubGlobal("fetch", fetchMock);
		const controller = new AbortController();
		const result = await mapStackTrace(`Error: failed\n    at play (${base}game-123.js:1:1)`, {
			cache: false,
			resolveSourceMap: (uri) => resolveSourceMap(uri, base, controller.signal),
		});
		expect(result.join("\n")).toContain("src/game.ts:1:1");
		expect(String(fetchMock.mock.calls[0][0])).toBe(`${base}game-123.js.map`);
		expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
	});
	it("does not request external URLs or files outside app assets", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		for (const uri of ["https://other.com/game.js", "https://example.com/private.js", `${base}game.wasm`]) {
			expect(await resolveSourceMap(uri, base, new AbortController().signal)).toBeNull();
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it("falls back when offline or a map is missing", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(new Response("missing", { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);
		expect(await resolveSourceMap(`${base}game.js`, base, new AbortController().signal)).toBeNull();
		expect(await resolveSourceMap(`${base}game.js`, base, new AbortController().signal)).toBeNull();
	});
	it("rejects maps exceeding the download limit", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(MAX_SOURCE_MAP_BYTES + 1))));
		expect(await resolveSourceMap(`${base}game.js`, base, new AbortController().signal)).toBeNull();
	});
});
