import type { createUpdateCoordinator } from "./updateCoordinator";
import { watchServiceWorkerUpdates } from "./serviceWorkerUpdates";

export function startServiceWorkerUpdates(
	container: ServiceWorkerContainer,
	updates: ReturnType<typeof createUpdateCoordinator>,
	baseUrl: string
) {
	let registration: ServiceWorkerRegistration | undefined;
	let inspect: (() => void) | undefined;
	let checking = false;
	const initialController = container.controller;
	const check = async () => {
		if (checking || !navigator.onLine || document.visibilityState === "hidden") return;
		checking = true;
		try {
			if (!registration) {
				registration = await container.register(`${baseUrl}sw.js`, { scope: baseUrl, updateViaCache: "none" });
				inspect = watchServiceWorkerUpdates(container, registration, updates, initialController);
			} else {
				await registration.update();
				inspect?.();
			}
		} catch (error) {
			console.warn("Unable to check for app updates", error);
		} finally {
			checking = false;
		}
	};
	// Install retry triggers before the first network operation.
	window.setInterval(() => void check(), 5 * 60 * 1000);
	window.addEventListener("online", () => void check());
	document.addEventListener("visibilitychange", () => void check());
	void check();
}
