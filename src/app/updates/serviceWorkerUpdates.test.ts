import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpdateCoordinator } from "./updateCoordinator";
import { watchServiceWorkerUpdates } from "./serviceWorkerUpdates";

function setup(controlled = true) {
	const worker = () => Object.assign(new EventTarget(), { postMessage: vi.fn(), state: "activated" });
	const container = Object.assign(new EventTarget(), { controller: controlled ? worker() : null });
	const registration = Object.assign(new EventTarget(), {
		waiting: null as ReturnType<typeof worker> | null,
		installing: null as ReturnType<typeof worker> | null,
		active: null as ReturnType<typeof worker> | null,
	});
	const reload = vi.fn();
	const updates = createUpdateCoordinator(reload);
	const watch = (initialController = container.controller) =>
		watchServiceWorkerUpdates(
			container as unknown as ServiceWorkerContainer,
			registration as unknown as ServiceWorkerRegistration,
			updates,
			initialController as unknown as ServiceWorker | null
		);
	return { worker, container, registration, reload, updates, watch };
}

describe("service worker lifecycle integration", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());
	it("unblocks after activation timeout and retries the waiting worker on inspection", async () => {
		const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
		const env = setup();
		const next = env.worker();
		next.state = "installed";
		env.registration.waiting = next;
		env.watch();
		env.updates.setBusy(false);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(env.updates.getSnapshot()).toBe("error");
		// The periodic updater inspects registration.waiting after update().
		env.updates.available();
		expect(env.updates.getSnapshot()).toBe("error");
		expect(next.postMessage).toHaveBeenCalledTimes(1);
		env.updates.retry();
		expect(next.postMessage).toHaveBeenCalledTimes(2);
		next.state = "activated";
		next.dispatchEvent(new Event("statechange"));
		await Promise.resolve();
		expect(env.reload).toHaveBeenCalledOnce();
		warning.mockRestore();
	});
	it("reloads an uncontrolled page after it explicitly applies a waiting update", () => {
		const env = setup(false);
		const next = env.worker();
		next.state = "installed";
		env.registration.waiting = next;
		env.watch();
		env.updates.setBusy(false);
		// No clients.claim(): this page remains uncontrolled after activation.
		next.state = "activated";
		next.dispatchEvent(new Event("statechange"));
		expect(env.container.controller).toBeNull();
		expect(env.reload).toHaveBeenCalledOnce();
	});
	it("handles an update already waiting before registration resolves", () => {
		const env = setup();
		const next = env.worker();
		next.state = "installed";
		env.registration.waiting = next;
		env.watch();
		expect(next.postMessage).not.toHaveBeenCalled();
		env.updates.setBusy(false);
		expect(next.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
		env.container.controller = next;
		next.state = "activated";
		env.container.dispatchEvent(new Event("controllerchange"));
		expect(env.reload).toHaveBeenCalledOnce();
	});

	it("observes installation started by a periodic check", () => {
		const env = setup();
		env.watch();
		env.updates.setBusy(false);
		const next = env.worker();
		next.state = "installing";
		env.registration.installing = next;
		env.registration.dispatchEvent(new Event("updatefound"));
		env.registration.waiting = next;
		next.state = "installed";
		next.dispatchEvent(new Event("statechange"));
		expect(next.postMessage).toHaveBeenCalledOnce();
	});

	it("defers controller changes from another tab without a prior waiting event", () => {
		const env = setup();
		env.watch();
		env.container.controller = env.worker();
		env.container.dispatchEvent(new Event("controllerchange"));
		expect(env.reload).not.toHaveBeenCalled();
		env.updates.setBusy(false);
		expect(env.reload).toHaveBeenCalledOnce();
	});

	it.each([false, true])("ignores the full first-install lifecycle (inspect waiting: %s)", async (inspectWaiting) => {
		const env = setup(false);
		const first = env.worker();
		first.state = "installing";
		env.registration.installing = first;
		const inspect = env.watch();
		env.updates.setBusy(false);
		first.state = "installed";
		env.registration.waiting = first;
		first.dispatchEvent(new Event("statechange"));
		if (inspectWaiting) inspect();
		expect(env.updates.getSnapshot()).toBe("idle");
		expect(first.postMessage).not.toHaveBeenCalled();
		env.registration.installing = null;
		env.registration.waiting = null;
		env.registration.active = first;
		first.state = "activated";
		first.dispatchEvent(new Event("statechange"));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(env.container.controller).toBeNull();
		expect(env.updates.getSnapshot()).toBe("idle");
		expect(env.reload).not.toHaveBeenCalled();
		// Later updates still apply on this uncontrolled page.
		const next = env.worker();
		next.state = "installing";
		env.registration.installing = next;
		env.registration.dispatchEvent(new Event("updatefound"));
		env.registration.waiting = next;
		next.state = "installed";
		next.dispatchEvent(new Event("statechange"));
		expect(next.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
		next.state = "activated";
		next.dispatchEvent(new Event("statechange"));
		expect(env.reload).toHaveBeenCalledOnce();
	});

	it("ignores first installation", () => {
		const env = setup(false);
		env.watch();
		env.updates.setBusy(false);
		env.container.controller = env.worker();
		env.container.dispatchEvent(new Event("controllerchange"));
		expect(env.reload).not.toHaveBeenCalled();
	});

	it("detects controller changes while register was pending", () => {
		const env = setup();
		const initialController = env.container.controller;
		env.container.controller = env.worker();
		env.watch(initialController);
		env.updates.setBusy(false);
		expect(env.reload).toHaveBeenCalledOnce();
	});
});
