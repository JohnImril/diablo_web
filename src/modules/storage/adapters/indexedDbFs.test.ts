import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";

vi.mock("idb", () => ({ openDB: vi.fn() }));

const save = new Uint8Array([1, 2, 3]);
const mpq = new Uint8Array([4, 5, 6]);

function database(previous?: Record<string, unknown>) {
	const stores = {
		files: new Map<string, unknown>([
			["single_0.sv", save],
			["spawn.mpq", mpq],
		]),
		save_meta: new Map<string, unknown>([["single_0.sv", null]]),
		app_meta: new Map<string, unknown>(previous ? [["current", previous]] : []),
	};
	type Store = keyof typeof stores;
	const db = {
		close: vi.fn(),
		get: vi.fn(async (store: Store, key: string) => stores[store].get(key)),
		getAllKeys: vi.fn(async (store: Store) => [...stores[store].keys()]),
		put: vi.fn(async (store: Store, value: unknown, key: string) => stores[store].set(key, value)),
		delete: vi.fn(async (store: Store, key: string) => stores[store].delete(key)),
		clear: vi.fn(async (store: Store) => stores[store].clear()),
	};
	return {
		...db,
		transaction: vi.fn(() => ({
			objectStore: (store: Store) => ({
				getAllKeys: () => db.getAllKeys(store),
				delete: (key: string) => db.delete(store, key),
				clear: () => db.clear(store),
				put: (value: unknown, key: string) => db.put(store, value, key),
			}),
			abort: vi.fn(),
			done: Promise.resolve(),
		})),
	};
}

beforeEach(() => {
	vi.resetModules();
	vi.stubGlobal("window", { indexedDB: {} });
	vi.stubGlobal("navigator", {
		locks: { request: vi.fn((_name, _options, callback) => callback({ name: "diablo_fs:session" })) },
	});
	vi.stubEnv("VITE_APP_ASSET_DATA_EPOCH", "1");
	vi.stubEnv("VITE_APP_SAVE_DATA_EPOCH", "1");
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("IndexedDB update safety", () => {
	it("shares one filesystem and one ownership request within a document", async () => {
		vi.mocked(openDB).mockResolvedValue(database() as never);
		const { default: createFs } = await import("./indexedDbFs");
		const first = createFs();
		const second = createFs();
		expect(second).toBe(first);
		expect(await second).toBe(await first);
		expect(navigator.locks.request).toHaveBeenCalledTimes(1);
		expect(openDB).toHaveBeenCalledTimes(1);
	});
	it("does not open or migrate storage when another tab owns it", async () => {
		vi.mocked(openDB).mockClear();
		vi.stubGlobal("navigator", {
			locks: {
				request: async (_name: string, _options: unknown, callback: (lock: null) => Promise<void>) =>
					callback(null),
			},
		});
		const { default: createFs } = await import("./indexedDbFs");
		await expect(createFs()).rejects.toThrow("another tab");
		expect(openDB).not.toHaveBeenCalled();
	});
	it("persists the current save on retry and then permits reload", async () => {
		const db = database();
		vi.mocked(openDB).mockResolvedValue(db as never);
		const { default: createFs } = await import("./indexedDbFs");
		const { pendingStorageWrites } = await import("../core/pendingWrites");
		const fs = await createFs();
		const latest = new Uint8Array([7, 8, 9]);
		db.put.mockRejectedValueOnce(new Error("quota"));
		await expect(fs.update("single_0.sv", latest)).rejects.toThrow("quota");
		pendingStorageWrites.retryFailed();
		await pendingStorageWrites.flush();
		expect(await db.get("files", "single_0.sv")).toEqual(latest);
	});
	it("does not lose a newer save when retrying a failed clear", async () => {
		const db = database();
		vi.mocked(openDB).mockResolvedValue(db as never);
		const { default: createFs } = await import("./indexedDbFs");
		const { pendingStorageWrites } = await import("../core/pendingWrites");
		const fs = await createFs();
		db.clear.mockRejectedValueOnce(new Error("temporary failure"));
		await expect(fs.clear()).rejects.toThrow();
		const latest = new Uint8Array([7, 8, 9]);
		await fs.update("single_1.sv", latest);
		pendingStorageWrites.retryFailed();
		await pendingStorageWrites.flush();
		expect(fs.files.get("single_1.sv")).toEqual(latest);
		expect(await db.get("files", "single_1.sv")).toEqual(latest);
		expect(await db.get("files", "single_0.sv")).toBeUndefined();
	});
	it.each([undefined, { buildId: "older-build", assetDataEpoch: "1", saveDataEpoch: "1" }])(
		"preserves saves and MPQ across ordinary updates, including legacy storage (%j)",
		async (previous) => {
			const db = database(previous);
			vi.mocked(openDB).mockResolvedValue(db as never);
			const { default: createFs } = await import("./indexedDbFs");
			const fs = await createFs();
			expect(fs.files.get("spawn.mpq")).toBe(mpq);
			expect(fs.files.get("single_0.sv")).toBe(save);
			expect(db.delete).not.toHaveBeenCalled();
		}
	);

	it("invalidates MPQ only when its data epoch changes", async () => {
		const db = database({ assetDataEpoch: "0", saveDataEpoch: "1" });
		vi.mocked(openDB).mockResolvedValue(db as never);
		const { default: createFs } = await import("./indexedDbFs");
		const fs = await createFs();
		expect(fs.files.has("spawn.mpq")).toBe(false);
		expect(fs.files.get("single_0.sv")).toBe(save);
	});

	it("still invalidates saves when their data epoch changes", async () => {
		const db = database({ assetDataEpoch: "1", saveDataEpoch: "0" });
		vi.mocked(openDB).mockResolvedValue(db as never);
		const { default: createFs } = await import("./indexedDbFs");
		const fs = await createFs();
		expect(fs.files.has("single_0.sv")).toBe(false);
		expect(fs.files.get("spawn.mpq")).toBe(mpq);
		expect(db.clear).toHaveBeenCalledWith("save_meta");
	});
	it("rejects a backward save epoch without deleting any data or changing metadata", async () => {
		const db = database({ assetDataEpoch: "0", saveDataEpoch: "2" });
		vi.mocked(openDB).mockResolvedValue(db as never);
		const { default: createFs } = await import("./indexedDbFs");
		await expect(createFs()).rejects.toThrow("older save data epoch");
		expect(db.delete).not.toHaveBeenCalled();
		expect(db.clear).not.toHaveBeenCalled();
		expect(db.put).not.toHaveBeenCalled();
		expect(db.close).toHaveBeenCalledOnce();
	});

	it("blocks reload when storage cannot open", async () => {
		const error = new Error("Storage unavailable");
		vi.mocked(openDB).mockRejectedValue(error);
		const { default: createFs } = await import("./indexedDbFs");
		const { pendingStorageWrites } = await import("../core/pendingWrites");
		await expect(createFs()).rejects.toBe(error);
		await expect(pendingStorageWrites.flush()).rejects.toBe(error);
	});

	it.each(["single_0.sv", "single_1.sv"])(
		"exports the latest %s and blocks reload after a failed write",
		async (name) => {
			const db = database();
			vi.mocked(openDB).mockResolvedValue(db as never);
			const { default: createFs } = await import("./indexedDbFs");
			const { pendingStorageWrites } = await import("../core/pendingWrites");
			const fs = await createFs();
			const error = new Error("Quota exceeded");
			db.put.mockRejectedValueOnce(error);
			const latest = new Uint8Array([0, 7, 8, 9, 0]).subarray(1, 4);
			await expect(fs.update(name, latest)).rejects.toBe(error);
			expect(fs.files.get(name)).toBe(latest);
			// The persisted copy is either stale or missing for a first save.
			expect(await db.get("files", name)).toBe(name === "single_0.sv" ? save : undefined);
			const url = await fs.fileUrl(name.toUpperCase());
			expect(url).toBeDefined();
			try {
				const blob = await (await fetch(url!)).blob();
				expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));
			} finally {
				URL.revokeObjectURL(url!);
			}
			await expect(pendingStorageWrites.flush()).rejects.toBe(error);
		}
	);
});
