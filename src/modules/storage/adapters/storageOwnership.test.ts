import { afterEach, describe, expect, it, vi } from "vitest";
import { withStorageOwnership } from "./storageOwnership";

afterEach(() => vi.unstubAllGlobals());

function locks() {
	let held = false;
	const request = vi.fn(
		async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => {
			if (held) return callback(null);
			held = true;
			try {
				return await callback({});
			} finally {
				held = false;
			}
		}
	);
	vi.stubGlobal("navigator", { locks: { request } });
	return request;
}

describe("storage ownership", () => {
	it("rejects another session before reading or modifying storage", async () => {
		const request = locks();
		const first = vi.fn(async () => "ready");
		expect(await withStorageOwnership(first)).toBe("ready");
		const second = vi.fn(async () => "stale");
		await expect(withStorageOwnership(second)).rejects.toThrow("another tab");
		expect(second).not.toHaveBeenCalled();
		expect(request).toHaveBeenCalledWith(
			"diablo_fs:session",
			{ mode: "exclusive", ifAvailable: true },
			expect.any(Function)
		);
	});
	it("protects initialization while the snapshot is still loading", async () => {
		locks();
		let finish!: (value: string) => void;
		const first = withStorageOwnership(
			() =>
				new Promise<string>((resolve) => {
					finish = resolve;
				})
		);
		await expect(withStorageOwnership(async () => "second")).rejects.toThrow("another tab");
		finish("ready");
		expect(await first).toBe("ready");
	});
	it("releases ownership if initialization fails", async () => {
		locks();
		await expect(
			withStorageOwnership(async () => {
				throw new Error("unavailable");
			})
		).rejects.toThrow("unavailable");
		expect(await withStorageOwnership(async () => "recovered")).toBe("recovered");
	});
	it("fails closed when reliable cross-tab locking is unavailable", async () => {
		vi.stubGlobal("navigator", {});
		const initialize = vi.fn(async () => "unsafe");
		await expect(withStorageOwnership(initialize)).rejects.toThrow("Web Locks");
		expect(initialize).not.toHaveBeenCalled();
	});
});
