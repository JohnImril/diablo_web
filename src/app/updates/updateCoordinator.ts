export type UpdateStatus = "idle" | "available" | "applying" | "saving" | "error" | "storage-error";
export const isUpdating = (status: UpdateStatus) => status === "applying" || status === "saving";

export function createUpdateCoordinator(reload: () => void | Promise<void>, prepareReload?: () => Promise<void>) {
	let status: UpdateStatus = "idle";
	let busy = true;
	let activated = false;
	let attempt = 0;
	let apply: (() => Promise<void>) | undefined;
	const listeners = new Set<() => void>();
	const setStatus = (value: UpdateStatus) => {
		if (status === value) return;
		status = value;
		listeners.forEach((listener) => listener());
	};
	const flush = () => {
		if (busy || status !== "available" || (!activated && !apply)) return;
		const currentAttempt = ++attempt;
		const run = (operation: () => void | Promise<void>, storage = false) => {
			const fail = (error: unknown) => {
				if (attempt !== currentAttempt) return;
				setStatus(storage ? "storage-error" : "error");
				console.warn("Unable to apply app update", error);
			};
			try {
				void Promise.resolve(operation()).catch(fail);
			} catch (error) {
				fail(error);
			}
		};
		if (!activated) {
			setStatus("applying");
			run(apply!);
			return;
		}
		const reloadReady = () => {
			if (attempt !== currentAttempt) return;
			if (busy) {
				setStatus("available");
				return;
			}
			setStatus("applying");
			run(reload);
		};
		if (prepareReload) {
			setStatus("saving");
			run(() => prepareReload().then(reloadReady), true);
		} else {
			setStatus("applying");
			run(reload);
		}
	};
	return {
		storageFailed(error: unknown) {
			attempt++;
			setStatus("storage-error");
			console.warn("Unable to prepare app update", error);
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot: () => status,
		retry() {
			if (isUpdating(status) || status === "idle") return;
			setStatus("available");
			flush();
		},
		applyNow(prepare?: () => Promise<void>) {
			if (isUpdating(status) || status === "idle") return;
			if (prepare) {
				const preparingAttempt = ++attempt;
				setStatus("saving");
				void Promise.resolve()
					.then(prepare)
					.then(
						() => {
							if (attempt !== preparingAttempt) return;
							busy = false;
							setStatus("available");
							flush();
						},
						(error) => this.storageFailed(error)
					);
				return;
			}
			busy = false;
			this.retry();
		},
		setBusy(value: boolean) {
			busy = value;
			flush();
		},
		setApply(value: () => Promise<void>) {
			apply = value;
			flush();
		},
		available() {
			if (status === "idle") setStatus("available");
			flush();
		},
		activated() {
			if (!activated) {
				activated = true;
				attempt++; // Ignore settlement of the older activation request.
				if (status !== "error" && status !== "storage-error") setStatus("available");
			}
			flush();
		},
	};
}
