/** Hold ownership before reading snapshots, migrations, or writing any files.
 * A write-only mutex is insufficient: another engine can still write a stale snapshot.
 * Never release on blur/pagehide or runtime stop: cached engines and pending retries
 * can still use this filesystem. The browser releases ownership when the document dies.
 */
export function withStorageOwnership<T>(initialize: () => Promise<T>): Promise<T> {
	if (!globalThis.navigator?.locks) {
		return Promise.reject(
			new Error(
				"Safe save storage requires Web Locks. Open the game in a supported browser over HTTPS or localhost."
			)
		);
	}
	return new Promise<T>((resolve, reject) => {
		void navigator.locks
			.request("diablo_fs:session", { mode: "exclusive", ifAvailable: true }, async (lock) => {
				if (!lock)
					throw new Error(
						"The game is already open in another tab. Close that tab, then reload this page to safely access your saves."
					);
				const value = await initialize();
				resolve(value);
				await new Promise<void>(() => {});
			})
			.catch(reject);
	});
}
