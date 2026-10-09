import { createUpdateCoordinator, isUpdating } from "./updateCoordinator";
import { startServiceWorkerUpdates } from "./registerUpdates";
import { pendingStorageWrites } from "../../modules/storage/core/pendingWrites";
import { createTabActivity } from "./tabActivity";

const activity = createTabActivity(navigator.locks, `diablo-web:${import.meta.env.BASE_URL}:activity`);
let controller = navigator.serviceWorker?.controller;
let busy = true;
let preparing = false;
const coordinator = createUpdateCoordinator(
	() => window.location.reload(),
	async () => {
		pendingStorageWrites.retryFailed();
		await pendingStorageWrites.flush();
	}
);
export const appUpdates = {
	...coordinator,
	setBusy(value: boolean) {
		if (preparing && !value) return;
		busy = value;
		if (value) void activity.enter().catch((error) => coordinator.storageFailed(error));
		else activity.leave();
		coordinator.setBusy(value);
	},
	async enterBusy() {
		const wasBusy = busy;
		busy = true;
		coordinator.setBusy(true);
		try {
			await activity.enter();
			// A controllerchange task may still be queued when the lock is granted.
			const next = navigator.serviceWorker?.controller;
			if (controller && next && next !== controller) coordinator.activated();
			if (next) controller = next;
			const status = coordinator.getSnapshot();
			if (isUpdating(status) || (status === "available" && !wasBusy)) {
				if (!wasBusy) this.setBusy(false);
				return false;
			}
			return true;
		} catch (error) {
			coordinator.storageFailed(error);
			return false;
		}
	},
	setApply(apply: () => Promise<void>) {
		coordinator.setApply(() => activity.exclusive(apply));
	},
	applyNow(prepare?: () => Promise<void>) {
		if (isUpdating(coordinator.getSnapshot()) || coordinator.getSnapshot() === "idle") return;
		preparing = true;
		coordinator.applyNow(async () => {
			try {
				await prepare?.();
			} finally {
				preparing = false;
			}
			busy = false;
			activity.leave();
		});
	},
};

if (import.meta.env.PROD && "serviceWorker" in navigator) {
	startServiceWorkerUpdates(navigator.serviceWorker, appUpdates, import.meta.env.BASE_URL);
}
