// Shared leases protect active sessions; activation needs an exclusive lease.
// Web Locks also releases leases when a tab/process disappears.
export function createTabActivity(locks: LockManager | undefined, name: string) {
	let lease: Promise<() => void> | undefined;
	return {
		enter() {
			if (!locks) return Promise.resolve();
			if (!lease) {
				lease = new Promise<() => void>((resolve, reject) => {
					void locks
						.request(
							name,
							{ mode: "shared" },
							() =>
								new Promise<void>((release) => {
									resolve(release);
								})
						)
						.catch(reject);
				});
			}
			return lease.then(() => {});
		},
		leave() {
			const previous = lease;
			lease = undefined;
			void previous?.then(
				(release) => release(),
				() => {}
			);
		},
		exclusive<T>(operation: () => Promise<T>): Promise<T> {
			if (!locks)
				return Promise.reject(
					new Error("Safe app updates require Web Locks. Close all game tabs and reopen the app to update.")
				);
			return locks.request(name, { mode: "exclusive" }, operation);
		},
	};
}
