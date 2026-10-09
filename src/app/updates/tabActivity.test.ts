import { describe, expect, it, vi } from "vitest";
import { createTabActivity } from "./tabActivity";

// A FIFO shared/exclusive lock scheduler, shared by all simulated tabs.
function lockManager() {
	let shared = 0;
	let exclusive = false;
	const queue: { mode: string; grant: () => void }[] = [];
	const drain = () => {
		while (queue.length && !exclusive) {
			const next = queue[0];
			if (next.mode === "exclusive" && shared) return;
			queue.shift();
			if (next.mode === "exclusive") exclusive = true;
			else shared++;
			next.grant();
		}
	};
	return {
		request: (_name: string, { mode }: { mode: string }, callback: () => unknown) =>
			new Promise((resolve, reject) => {
				queue.push({
					mode,
					grant: () => {
						void Promise.resolve()
							.then(callback)
							.then(resolve, reject)
							.finally(() => {
								if (mode === "exclusive") exclusive = false;
								else shared--;
								drain();
							});
					},
				});
				drain();
			}),
	} as unknown as LockManager;
}

describe("updates across game tabs", () => {
	it("waits for every active tab and blocks a new session during activation", async () => {
		const locks = lockManager();
		const playing = createTabActivity(locks, "app");
		const compressing = createTabActivity(locks, "app");
		const menu = createTabActivity(locks, "app");
		await playing.enter();
		await compressing.enter();
		let finish!: () => void;
		const apply = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		const updating = menu.exclusive(apply);
		await Promise.resolve();
		expect(apply).not.toHaveBeenCalled();
		playing.leave();
		await Promise.resolve();
		expect(apply).not.toHaveBeenCalled();
		compressing.leave();
		await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
		const started = vi.fn();
		const starting = playing.enter().then(started);
		await Promise.resolve();
		expect(started).not.toHaveBeenCalled();
		finish();
		await updating;
		await starting;
		playing.leave();
	});
	it("releases a lease cancelled before it was acquired", async () => {
		const locks = lockManager();
		const first = createTabActivity(locks, "app");
		const second = createTabActivity(locks, "app");
		let finish!: () => void;
		const updating = first.exclusive(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		await Promise.resolve();
		const entering = second.enter();
		second.leave();
		finish();
		await updating;
		await entering;
		await first.exclusive(async () => {});
	});
	it("preserves gameplay but blocks unsafe activation without Web Locks", async () => {
		const tab = createTabActivity(undefined, "app");
		await expect(tab.enter()).resolves.toBeUndefined();
		const apply = vi.fn(async () => {});
		await expect(tab.exclusive(apply)).rejects.toThrow("Close all game tabs");
		expect(apply).not.toHaveBeenCalled();
	});
});
