import { describe, expect, it, vi } from "vitest";
import { createPendingWrites } from "../../modules/storage/core/pendingWrites";
import { createUpdateCoordinator } from "./updateCoordinator";

describe("app updates", () => {
	it("does not activate until the engine has confirmed its save snapshot", async () => {
		let finish!: () => void;
		const updates = createUpdateCoordinator(vi.fn());
		const apply = vi.fn(async () => {});
		updates.setApply(apply);
		updates.available();
		updates.applyNow(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		expect(updates.getSnapshot()).toBe("saving");
		await Promise.resolve();
		expect(apply).not.toHaveBeenCalled();
		finish();
		await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
	});
	it("blocks activation when engine preparation fails and allows another attempt", async () => {
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const updates = createUpdateCoordinator(vi.fn());
			const apply = vi.fn(async () => {});
			updates.setApply(apply);
			updates.available();
			updates.applyNow(async () => {
				throw new Error("engine timeout");
			});
			await vi.waitFor(() => expect(updates.getSnapshot()).toBe("storage-error"));
			expect(apply).not.toHaveBeenCalled();
			updates.applyNow(async () => {});
			await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
		} finally {
			warning.mockRestore();
		}
	});
	it("explicitly applies from a busy error screen and permits a second attempt", async () => {
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const apply = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(undefined);
			const updates = createUpdateCoordinator(vi.fn());
			updates.setApply(apply);
			updates.available();
			expect(apply).not.toHaveBeenCalled();
			updates.applyNow();
			await Promise.resolve();
			expect(updates.getSnapshot()).toBe("error");
			updates.setBusy(true);
			updates.applyNow();
			expect(updates.getSnapshot()).toBe("applying");
			expect(apply).toHaveBeenCalledTimes(2);
		} finally {
			warning.mockRestore();
		}
	});
	it("does not notify subscribers when inspection leaves the state unchanged", () => {
		const updates = createUpdateCoordinator(vi.fn());
		const listener = vi.fn();
		const unsubscribe = updates.subscribe(listener);
		updates.available();
		updates.available();
		expect(listener).toHaveBeenCalledOnce();
		unsubscribe();
	});
	it("does not reload after a timed-out save settles until an explicit retry", async () => {
		vi.useFakeTimers();
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const writes = createPendingWrites();
			let finish!: () => void;
			writes.track(
				new Promise<void>((resolve) => {
					finish = resolve;
				})
			);
			const reload = vi.fn();
			const updates = createUpdateCoordinator(reload, () => writes.flush());
			updates.setBusy(false);
			updates.activated();
			await vi.advanceTimersByTimeAsync(30_000);
			expect(updates.getSnapshot()).toBe("storage-error");
			finish();
			await vi.advanceTimersByTimeAsync(0);
			expect(reload).not.toHaveBeenCalled();
			updates.retry();
			await vi.advanceTimersByTimeAsync(0);
			expect(reload).toHaveBeenCalledOnce();
		} finally {
			warning.mockRestore();
			vi.useRealTimers();
		}
	});
	it("ignores a stale activation failure while finishing saves", async () => {
		let rejectApply!: (error: Error) => void;
		let finishSave!: () => void;
		const reload = vi.fn();
		const updates = createUpdateCoordinator(
			reload,
			() =>
				new Promise<void>((resolve) => {
					finishSave = resolve;
				})
		);
		updates.setApply(
			() =>
				new Promise<void>((_, reject) => {
					rejectApply = reject;
				})
		);
		updates.setBusy(false);
		updates.available();
		updates.activated();
		rejectApply(new Error("late failure"));
		await Promise.resolve();
		expect(updates.getSnapshot()).toBe("saving");
		finishSave();
		await Promise.resolve();
		expect(reload).toHaveBeenCalledOnce();
	});
	it("keeps the wait screen on duplicate retry", () => {
		const apply = vi.fn(() => new Promise<void>(() => {}));
		const updates = createUpdateCoordinator(vi.fn());
		updates.setApply(apply);
		updates.setBusy(false);
		updates.available();
		updates.retry();
		expect(updates.getSnapshot()).toBe("applying");
		expect(apply).toHaveBeenCalledOnce();
	});
	it("reports synchronous preparation errors", () => {
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		const updates = createUpdateCoordinator(vi.fn(), () => {
			throw new Error("storage unavailable");
		});
		updates.setBusy(false);
		expect(() => updates.activated()).not.toThrow();
		expect(updates.getSnapshot()).toBe("storage-error");
		warning.mockRestore();
	});
	it("preserves storage failure and never reloads on retry", async () => {
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		const reload = vi.fn();
		const prepare = vi.fn().mockRejectedValue(new Error("quota exceeded"));
		const updates = createUpdateCoordinator(reload, prepare);
		updates.setBusy(false);
		updates.activated();
		await vi.waitFor(() => expect(updates.getSnapshot()).toBe("storage-error"));
		updates.setBusy(true);
		updates.setBusy(false);
		expect(prepare).toHaveBeenCalledOnce();
		updates.retry();
		await vi.waitFor(() => expect(updates.getSnapshot()).toBe("storage-error"));
		expect(prepare).toHaveBeenCalledTimes(2);
		expect(reload).not.toHaveBeenCalled();
		warning.mockRestore();
	});
	it("waits for storage before reloading", async () => {
		let finish!: () => void;
		const reload = vi.fn();
		const updates = createUpdateCoordinator(
			reload,
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		updates.setBusy(false);
		updates.activated();
		expect(reload).not.toHaveBeenCalled();
		expect(updates.getSnapshot()).toBe("saving");
		finish();
		await Promise.resolve();
		expect(reload).toHaveBeenCalledOnce();
	});
	it("unblocks the menu after a failed application and allows retry", async () => {
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		const apply = vi.fn().mockRejectedValueOnce(new Error("superseded")).mockResolvedValueOnce(undefined);
		const updates = createUpdateCoordinator(vi.fn());
		updates.setApply(apply);
		updates.setBusy(false);
		updates.available();
		await Promise.resolve();
		expect(updates.getSnapshot()).toBe("error");
		expect(updates.getSnapshot()).toBe("error");
		updates.available();
		expect(apply).toHaveBeenCalledTimes(1);
		updates.retry();
		expect(apply).toHaveBeenCalledTimes(2);
		warning.mockRestore();
	});
	it("does not reload if the screen becomes busy during storage flush", async () => {
		let finish!: () => void;
		const reload = vi.fn();
		const updates = createUpdateCoordinator(
			reload,
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		updates.setBusy(false);
		updates.activated();
		updates.setBusy(true);
		finish();
		await Promise.resolve();
		expect(reload).not.toHaveBeenCalled();
	});
	it("reloads only once even if activation is reported repeatedly", () => {
		const reload = vi.fn();
		const updates = createUpdateCoordinator(reload);
		updates.setBusy(false);
		updates.activated();
		updates.activated();
		expect(reload).toHaveBeenCalledOnce();
	});
	it("waits for the game to exit before activating and reloading", () => {
		const reload = vi.fn();
		const apply = vi.fn(async () => {});
		const updates = createUpdateCoordinator(reload);
		updates.setApply(apply);
		updates.available();
		expect(apply).not.toHaveBeenCalled();
		updates.setBusy(false);
		expect(apply).toHaveBeenCalledOnce();
		expect(reload).not.toHaveBeenCalled();
		updates.activated();
		expect(reload).toHaveBeenCalledOnce();
	});

	it("defers activation from another tab while this tab is playing", () => {
		const reload = vi.fn();
		const updates = createUpdateCoordinator(reload);
		updates.activated();
		expect(reload).not.toHaveBeenCalled();
		updates.setBusy(false);
		updates.setBusy(false);
		expect(reload).toHaveBeenCalledOnce();
	});

	it("automatically applies an update received on the start screen", () => {
		const apply = vi.fn(async () => {});
		const updates = createUpdateCoordinator(vi.fn());
		updates.setApply(apply);
		updates.setBusy(false);
		updates.available();
		updates.available();
		expect(apply).toHaveBeenCalledOnce();
	});
});
