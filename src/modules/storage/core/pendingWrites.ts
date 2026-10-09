export function createPendingWrites() {
	const pending = new Set<Promise<unknown>>();
	const waiters = new Set<() => void>();
	const failures = new Map<string | symbol, unknown>();
	const latest = new Map<string | symbol, Promise<unknown>>();
	const retries = new Map<string | symbol, () => Promise<unknown>>();
	const settled = (operation: Promise<unknown>) => {
		pending.delete(operation);
		if (!pending.size) {
			queueMicrotask(() => {
				if (!pending.size) waiters.forEach((check) => check());
			});
		}
	};
	return {
		track<T>(operation: Promise<T>, key: string | symbol = Symbol(), retry?: () => Promise<unknown>): Promise<T> {
			latest.set(key, operation);
			if (retry) retries.set(key, retry);
			else retries.delete(key);
			pending.add(operation);
			void operation.then(
				() => {
					if (latest.get(key) === operation) {
						failures.delete(key);
						latest.delete(key);
						retries.delete(key);
					}
					settled(operation);
				},
				(error) => {
					if (latest.get(key) === operation) failures.set(key, error);
					settled(operation);
				}
			);
			return operation;
		},
		retryFailed(): void {
			for (const key of [...failures.keys()]) {
				const retry = retries.get(key);
				if (retry) this.track(Promise.resolve().then(retry), key, retry);
			}
		},
		resolveFailures(prefix: string) {
			for (const key of failures.keys()) {
				if (typeof key === "string" && key.startsWith(prefix)) {
					failures.delete(key);
					retries.delete(key);
				}
			}
		},
		flush(timeoutMs = 30_000): Promise<void> {
			if (!pending.size)
				return failures.size ? Promise.reject(failures.values().next().value) : Promise.resolve();
			return new Promise<void>((resolve, reject) => {
				const finish = () => {
					clearTimeout(timer);
					waiters.delete(finish);
					if (failures.size) reject(failures.values().next().value);
					else resolve();
				};
				const timer = setTimeout(() => {
					waiters.delete(finish);
					reject(new Error("Saving timed out. Reload was blocked to protect your saves."));
				}, timeoutMs);
				waiters.add(finish);
			});
		},
	};
}

export const pendingStorageWrites = createPendingWrites();
