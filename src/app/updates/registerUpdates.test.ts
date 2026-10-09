import { afterEach, describe, expect, it, vi } from "vitest";
import { startServiceWorkerUpdates } from "./registerUpdates";
import { createUpdateCoordinator } from "./updateCoordinator";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("registration recovery", () => {
	it("retries a failed initial registration when the network returns", async () => {
		const windowTarget = Object.assign(new EventTarget(), { setInterval: vi.fn() });
		const documentTarget = Object.assign(new EventTarget(), { visibilityState: "visible" });
		vi.stubGlobal("window", windowTarget);
		vi.stubGlobal("document", documentTarget);
		vi.stubGlobal("navigator", { onLine: true });
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const registration = Object.assign(new EventTarget(), {
			waiting: null,
			installing: null,
			active: null,
			update: vi.fn(async () => {}),
		});
		const register = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(registration);
		const container = Object.assign(new EventTarget(), { controller: null, register });
		startServiceWorkerUpdates(
			container as unknown as ServiceWorkerContainer,
			createUpdateCoordinator(vi.fn()),
			"/diablo_web/"
		);
		await Promise.resolve();
		await Promise.resolve();
		windowTarget.dispatchEvent(new Event("online"));
		await Promise.resolve();
		expect(register).toHaveBeenCalledTimes(2);
		expect(register).toHaveBeenLastCalledWith("/diablo_web/sw.js", {
			scope: "/diablo_web/",
			updateViaCache: "none",
		});
		documentTarget.dispatchEvent(new Event("visibilitychange"));
		await Promise.resolve();
		expect(registration.update).toHaveBeenCalledOnce();
	});
});
