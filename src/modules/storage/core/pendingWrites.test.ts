import { describe, expect, it, vi } from "vitest";
import { createPendingWrites } from "./pendingWrites";

describe("pending storage writes", () => {
	it("recovers only the failed resource after a successful retry", async () => {
		const writes = createPendingWrites();
		const retry = vi.fn(async () => {});
		await expect(writes.track(Promise.reject(new Error("quota")), "save:a", retry)).rejects.toThrow("quota");
		await writes.track(Promise.resolve(), "save:b");
		await expect(writes.flush()).rejects.toThrow("quota");
		await writes.retryFailed();
		await expect(writes.flush()).resolves.toBeUndefined();
		expect(retry).toHaveBeenCalledOnce();
	});
	it("does not forget an unrecovered failure on retry", async () => {
		const writes = createPendingWrites();
		const retry = async () => {
			throw new Error("still full");
		};
		await expect(writes.track(Promise.reject(new Error("quota")), "save:a", retry)).rejects.toThrow();
		await writes.retryFailed();
		await expect(writes.flush()).rejects.toThrow("still full");
	});
	it("ignores an older failure after a newer write to the same resource succeeds", async () => {
		const writes = createPendingWrites();
		let fail!: (error: Error) => void;
		const older = writes.track(
			new Promise<void>((_, reject) => {
				fail = reject;
			}),
			"save:a"
		);
		await writes.track(Promise.resolve(), "save:a");
		fail(new Error("older transaction failed"));
		await expect(older).rejects.toThrow();
		await expect(writes.flush()).resolves.toBeUndefined();
	});
	it("waits for a write queued by completion of another write", async () => {
		const writes = createPendingWrites();
		let firstDone!: () => void;
		let secondDone!: () => void;
		const first = new Promise<void>((resolve) => {
			firstDone = resolve;
		});
		writes.track(first);
		void first.then(() =>
			writes.track(
				new Promise<void>((resolve) => {
					secondDone = resolve;
				})
			)
		);
		const done = vi.fn();
		const flushing = writes.flush().then(done);
		firstDone();
		await Promise.resolve();
		await Promise.resolve();
		expect(done).not.toHaveBeenCalled();
		secondDone();
		await flushing;
		expect(done).toHaveBeenCalledOnce();
	});
	it("handles concurrent waiters with independent deadlines", async () => {
		vi.useFakeTimers();
		try {
			const writes = createPendingWrites();
			let finish!: () => void;
			writes.track(
				new Promise<void>((resolve) => {
					finish = resolve;
				})
			);
			const early = expect(writes.flush(10)).rejects.toThrow("Saving timed out");
			const later = writes.flush(100);
			await vi.advanceTimersByTimeAsync(10);
			await early;
			finish();
			await expect(later).resolves.toBeUndefined();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
	it("times out without dropping the write and permits retry after it finishes", async () => {
		vi.useFakeTimers();
		try {
			const writes = createPendingWrites();
			let finish!: () => void;
			writes.track(
				new Promise<void>((resolve) => {
					finish = resolve;
				})
			);
			const result = expect(writes.flush()).rejects.toThrow("Saving timed out");
			await vi.advanceTimersByTimeAsync(30_000);
			await result;
			const retry = expect(writes.flush()).rejects.toThrow("Saving timed out");
			await vi.advanceTimersByTimeAsync(30_000);
			await retry;
			finish();
			await expect(writes.flush()).resolves.toBeUndefined();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
	it("clears the deadline after successful flush", async () => {
		vi.useFakeTimers();
		try {
			const writes = createPendingWrites();
			writes.track(Promise.resolve());
			await writes.flush();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
	it("waits for all writes, including writes started while flushing", async () => {
		const writes = createPendingWrites();
		let finishFirst!: () => void;
		let finishSecond!: () => void;
		writes.track(
			new Promise<void>((resolve) => {
				finishFirst = resolve;
			})
		);
		const done = vi.fn();
		const flushing = writes.flush().then(done);
		writes.track(
			new Promise<void>((resolve) => {
				finishSecond = resolve;
			})
		);
		finishFirst();
		await Promise.resolve();
		expect(done).not.toHaveBeenCalled();
		finishSecond();
		await flushing;
		expect(done).toHaveBeenCalledOnce();
	});
	it("blocks reload after a failed write even if it has already settled", async () => {
		const writes = createPendingWrites();
		const error = new Error("quota exceeded");
		await expect(writes.track(Promise.reject(error))).rejects.toBe(error);
		await expect(writes.flush()).rejects.toBe(error);
	});
});
