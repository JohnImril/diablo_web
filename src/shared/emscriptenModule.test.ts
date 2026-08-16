import { describe, expect, it } from "vitest";
import { loadEmscriptenModule } from "./emscriptenModule";

describe("loadEmscriptenModule", () => {
	it("loads the legacy synchronous factory contract", async () => {
		const module = { value: "legacy" };
		const legacy = Object.assign(module, { ready: Promise.resolve(module) });
		await expect(loadEmscriptenModule(() => legacy, {})).resolves.toBe(module);
	});

	it("loads the modern asynchronous factory contract", async () => {
		const module = { value: "modern" };
		await expect(loadEmscriptenModule(() => Promise.resolve(module), {})).resolves.toBe(module);
	});
});

