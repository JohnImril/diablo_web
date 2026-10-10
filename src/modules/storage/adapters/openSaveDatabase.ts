import { openDB } from "idb";
import type { IDBPDatabase, OpenDBCallbacks } from "idb";

// Version 5 is a protocol barrier: legacy clients open version 4 without
// acquiring our Web Lock. The upgrade must wait for all their connections.
export function openSaveDatabase(upgrade: OpenDBCallbacks<unknown>["upgrade"]): Promise<IDBPDatabase<unknown>> {
	return new Promise((resolve, reject) => {
		let abandoned = false;
		void openDB("diablo_fs", 5, {
			upgrade(db, oldVersion, newVersion, transaction, event) {
				// IndexedDB open requests cannot be cancelled. A rejected attempt
				// must not upgrade later, after it has released storage ownership.
				if (abandoned) {
					// idb also exposes an independent transaction.done promise.
					// Handling the open request rejection alone does not handle it.
					void transaction.done.catch(() => {});
					transaction.abort();
					return;
				}
				upgrade?.(db, oldVersion, newVersion, transaction, event);
			},
			blocked() {
				abandoned = true;
				reject(
					new Error(
						"An older game tab is using your saves. Finish saving and close the other game tabs, then reload this page."
					)
				);
			},
		}).then((db) => {
			if (abandoned) db.close();
			else resolve(db);
		}, reject);
	});
}
