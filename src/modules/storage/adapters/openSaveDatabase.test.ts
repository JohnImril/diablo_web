import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import type { IDBPDatabase, OpenDBCallbacks } from "idb";
import { openSaveDatabase } from "./openSaveDatabase";

vi.mock("idb", () => ({ openDB: vi.fn() }));
beforeEach(() => {
	vi.mocked(openDB).mockReset();
});
afterEach(() => {
	vi.useRealTimers();
});

function pendingOpen() {
	let callbacks!: OpenDBCallbacks<unknown>;
	let finish!: (db: IDBPDatabase<unknown>) => void;
	let fail!: (error: Error) => void;
	vi.mocked(openDB).mockImplementation((_name, _version, options) => {
		callbacks = options!;
		return new Promise((resolve, reject) => {
			finish = resolve;
			fail = reject;
		});
	});
	return {
		get callbacks() {
			return callbacks;
		},
		finish: (db: IDBPDatabase<unknown>) => finish(db),
		fail: (error: Error) => fail(error),
	};
}

describe("legacy save protocol barrier", () => {
	it("requests version 5 and preserves the schema on an ordinary open", async () => {
		const db = { close: vi.fn() } as unknown as IDBPDatabase<unknown>;
		vi.mocked(openDB).mockResolvedValue(db);
		expect(await openSaveDatabase(vi.fn())).toBe(db);
		expect(openDB).toHaveBeenCalledWith("diablo_fs", 5, expect.any(Object));
		expect(db.close).not.toHaveBeenCalled();
	});
	it("reports old connections immediately and aborts a late upgrade", async () => {
		const pending = pendingOpen();
		const upgrade = vi.fn();
		const operation = openSaveDatabase(upgrade);
		pending.callbacks.blocked!(4, 5, {} as IDBVersionChangeEvent);
		await expect(operation).rejects.toThrow("older game tab");
		const transaction = { abort: vi.fn(), done: Promise.reject(new Error("transaction AbortError")) };
		pending.callbacks.upgrade!({} as never, 4, 5, transaction as never, {} as IDBVersionChangeEvent);
		expect(transaction.abort).toHaveBeenCalledOnce();
		expect(upgrade).not.toHaveBeenCalled();
		// Aborting the underlying request must not produce an unhandled rejection.
		pending.fail(new Error("AbortError"));
		await Promise.resolve();
	});
	it("closes any connection that resolves after the caller was rejected", async () => {
		const pending = pendingOpen();
		const operation = openSaveDatabase(vi.fn());
		pending.callbacks.blocked!(4, 5, {} as IDBVersionChangeEvent);
		await expect(operation).rejects.toThrow("close the other game tabs");
		const db = { close: vi.fn() } as unknown as IDBPDatabase<unknown>;
		pending.finish(db);
		await Promise.resolve();
		expect(db.close).toHaveBeenCalledOnce();
	});
	it("permits a new attempt after the old connections close", async () => {
		const pending = pendingOpen();
		const first = openSaveDatabase(vi.fn());
		pending.callbacks.blocked!(4, 5, {} as IDBVersionChangeEvent);
		await expect(first).rejects.toThrow("older game tab");
		pending.fail(new Error("AbortError"));
		const db = { close: vi.fn() } as unknown as IDBPDatabase<unknown>;
		vi.mocked(openDB).mockResolvedValue(db);
		expect(await openSaveDatabase(vi.fn())).toBe(db);
	});
	it("retries a transient IndexedDB UnknownError without depending on its message", async () => {
		vi.useFakeTimers();
		const error = new DOMException("Browser-specific transient failure", "UnknownError");
		const db = { close: vi.fn() } as unknown as IDBPDatabase<unknown>;
		vi.mocked(openDB).mockRejectedValueOnce(error).mockResolvedValueOnce(db);

		const operation = openSaveDatabase(vi.fn());
		await vi.advanceTimersByTimeAsync(250);

		await expect(operation).resolves.toBe(db);
		expect(openDB).toHaveBeenCalledTimes(2);
	});
	it("stops retrying transient open failures after bounded attempts", async () => {
		vi.useFakeTimers();
		const error = new DOMException("Unable to open database file on disk", "UnknownError");
		vi.mocked(openDB).mockRejectedValue(error);

		const operation = openSaveDatabase(vi.fn());
		const rejection = expect(operation).rejects.toBe(error);
		await vi.runAllTimersAsync();

		await rejection;
		expect(openDB).toHaveBeenCalledTimes(3);
	});
	it("does not retry unrelated open failures", async () => {
		const error = new DOMException("The requested version is too old", "VersionError");
		vi.mocked(openDB).mockRejectedValue(error);

		await expect(openSaveDatabase(vi.fn())).rejects.toBe(error);
		expect(openDB).toHaveBeenCalledOnce();
	});
});
