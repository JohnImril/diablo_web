import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function environment() {
	const released = vi.fn();
	const locks = {
		request: vi.fn((_name: string, options: { mode: string }, callback: () => Promise<void>) => {
			const holding = Promise.resolve().then(callback);
			if (options.mode === "shared") void holding.then(released);
			return holding;
		}),
	};
	vi.stubGlobal("navigator", { locks });
	return { released };
}

describe("React screen transitions during explicit updates", () => {
	it("retains the session lease until preparation succeeds even if the UI becomes idle", async () => {
		const { released } = environment();
		const { appUpdates } = await import("./pwaUpdates");
		await appUpdates.enterBusy();
		const apply = vi.fn(async () => {});
		appUpdates.setApply(apply);
		appUpdates.available();
		let finish!: () => void;
		appUpdates.applyNow(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		appUpdates.setBusy(false);
		await Promise.resolve();
		expect(released).not.toHaveBeenCalled();
		expect(apply).not.toHaveBeenCalled();
		finish();
		await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
		expect(released).toHaveBeenCalledOnce();
	});
	it("keeps unsaved memory protected when preparation fails", async () => {
		const { released } = environment();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const { appUpdates } = await import("./pwaUpdates");
		await appUpdates.enterBusy();
		const apply = vi.fn(async () => {});
		appUpdates.setApply(apply);
		appUpdates.available();
		appUpdates.applyNow(async () => {
			throw new Error("saving failed");
		});
		appUpdates.setBusy(false);
		await vi.waitFor(() => expect(appUpdates.getSnapshot()).toBe("storage-error"));
		expect(apply).not.toHaveBeenCalled();
		expect(released).not.toHaveBeenCalled();
		appUpdates.setBusy(false);
	});
});
