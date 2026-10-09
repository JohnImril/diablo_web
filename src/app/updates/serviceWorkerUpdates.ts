import type { createUpdateCoordinator } from "./updateCoordinator";

export function watchServiceWorkerUpdates(
	container: ServiceWorkerContainer,
	registration: ServiceWorkerRegistration,
	updates: ReturnType<typeof createUpdateCoordinator>,
	initialController = container.controller
) {
	let controller = initialController;
	const watched = new WeakMap<ServiceWorker, boolean>();
	const watch = (worker: ServiceWorker | null, isUpdate: boolean) => {
		if (!worker) return;
		if (watched.has(worker)) {
			if (isUpdate) watched.set(worker, true);
			return;
		}
		watched.set(worker, isUpdate);
		const changed = () => {
			if (worker.state === "installed" && registration.waiting === worker && watched.get(worker))
				updates.available();
			if (worker.state === "activated" && watched.get(worker)) updates.activated();
			if (worker.state === "activated" || worker.state === "redundant")
				worker.removeEventListener("statechange", changed);
		};
		worker.addEventListener("statechange", changed);
		changed();
	};
	const inspect = () => {
		watch(registration.installing, !!registration.active || !!controller);
		// Preserve first-install classification when inspection catches it waiting.
		const waiting = registration.waiting;
		if (waiting) {
			watch(waiting, watched.get(waiting) ?? true);
			if (watched.get(waiting)) updates.available();
		}
	};
	const onControllerChange = () => {
		const next = container.controller;
		if (next && next !== controller && (controller || updates.getSnapshot() !== "idle")) {
			watch(next, true);
			if (next.state === "activated") updates.activated();
		}
		controller = next;
	};
	container.addEventListener("controllerchange", onControllerChange);
	onControllerChange();
	updates.setApply(
		() =>
			new Promise<void>((resolve, reject) => {
				const worker = registration.waiting;
				if (!worker) {
					reject(new Error("The app update is no longer waiting"));
					return;
				}
				const finish = () => {
					if (worker.state !== "activated" && worker.state !== "redundant") return;
					clearTimeout(timeout);
					worker.removeEventListener("statechange", finish);
					if (worker.state === "activated") resolve();
					else reject(new Error("The app update was superseded"));
				};
				const timeout = setTimeout(() => {
					worker.removeEventListener("statechange", finish);
					reject(new Error("App update activation timed out"));
				}, 30_000);
				worker.addEventListener("statechange", finish);
				try {
					worker.postMessage({ type: "SKIP_WAITING" });
				} catch (error) {
					clearTimeout(timeout);
					worker.removeEventListener("statechange", finish);
					reject(error);
				}
			})
	);
	registration.addEventListener("updatefound", inspect);
	inspect();
	return inspect;
}
