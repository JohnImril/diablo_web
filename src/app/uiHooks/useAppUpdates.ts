import { useLayoutEffect, useSyncExternalStore } from "react";
import { appUpdates } from "../updates/pwaUpdates";
import { isUpdating } from "../updates/updateCoordinator";

export function useAppUpdates(active: boolean, hasError: boolean) {
	const status = useSyncExternalStore(appUpdates.subscribe, appUpdates.getSnapshot);
	const updating = isUpdating(status);
	const busy = active || (hasError && !updating);
	useLayoutEffect(() => {
		appUpdates.setBusy(busy);
		return () => appUpdates.setBusy(true);
	}, [busy]);
	return { status, updating, available: status !== "idle" };
}
