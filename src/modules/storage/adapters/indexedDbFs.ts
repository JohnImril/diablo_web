import { openSaveDatabase } from "./openSaveDatabase";
import { withStorageOwnership } from "./storageOwnership";
import type { IDBPDatabase } from "idb";
import type { IFileSystem, IPlayerInfo } from "types";
import getPlayerName from "shared/parsers/saveFile";
import { readFileAsArrayBuffer, toArrayBuffer } from "shared/buffers";
import { triggerDownload } from "./download";
import { MAX_MPQ_SIZE, MAX_SV_SIZE } from "constants/files";
import { isSaveFile } from "../core/saveRules";
import { pendingStorageWrites } from "../core/pendingWrites";
import { shouldResetSaves } from "../core/saveEpoch";

const APP_ASSET_DATA_EPOCH = import.meta.env.VITE_APP_ASSET_DATA_EPOCH || "1";
const APP_SAVE_DATA_EPOCH = import.meta.env.VITE_APP_SAVE_DATA_EPOCH || "1";

type AppStorageMeta = {
	assetDataEpoch: string | number;
	saveDataEpoch: string | number;
};

const CURRENT_APP_STORAGE_META: AppStorageMeta = {
	assetDataEpoch: APP_ASSET_DATA_EPOCH,
	saveDataEpoch: APP_SAVE_DATA_EPOCH,
};

export async function downloadFile(db: IDBPDatabase<unknown>, name: string) {
	const file = await db.get("files", name.toLowerCase());
	if (!file) {
		console.error(`File ${name} does not exist`);
		return;
	}
	const blob = new Blob([file], { type: "binary/octet-stream" });
	const url = URL.createObjectURL(blob);
	triggerDownload(url, name);
}

async function downloadSaves(db: IDBPDatabase<unknown>) {
	const keys = await db.getAllKeys("files");
	for (const name of keys) {
		if ((name as string).match(/\.sv$/i)) {
			await downloadFile(db, name as string);
		}
	}
}

const readFile = (file: File): Promise<ArrayBuffer> => readFileAsArrayBuffer(file);

async function uploadFile(db: IDBPDatabase<unknown>, files: Map<string, Uint8Array>, file: File) {
	const name = file.name.toLowerCase();
	const maxSize = name.endsWith(".sv") ? MAX_SV_SIZE : MAX_MPQ_SIZE;
	if (file.size > maxSize) {
		throw new Error(`File is too large. Maximum allowed size is ${name.endsWith(".sv") ? "10 MB" : "1 GB"}.`);
	}
	const data = new Uint8Array(await readFile(file));
	files.set(file.name.toLowerCase(), data);
	await db.put("files", data, file.name.toLowerCase());
}

async function reconcileStoredAppState(db: IDBPDatabase<unknown>) {
	const previous = (await db.get("app_meta", "current")) as AppStorageMeta | undefined;
	const previousAssetDataEpoch = String(previous?.assetDataEpoch ?? "1");
	const previousSaveDataEpoch = String(previous?.saveDataEpoch ?? "1");
	const shouldClearAssetData = previousAssetDataEpoch !== CURRENT_APP_STORAGE_META.assetDataEpoch;
	const shouldClearSaveData = shouldResetSaves(previousSaveDataEpoch, APP_SAVE_DATA_EPOCH);

	// Commit the reset and its generation together. A failed/aborted reset must
	// not leave deleted files with stale metadata that triggers another reset.
	const tx = db.transaction(["files", "save_meta", "app_meta"], "readwrite");
	try {
		const files = tx.objectStore("files");
		if (shouldClearSaveData || shouldClearAssetData) {
			for (const key of await files.getAllKeys()) {
				const save = isSaveFile(String(key));
				if (save ? shouldClearSaveData : shouldClearAssetData) await files.delete(key);
			}
		}
		if (shouldClearSaveData) await tx.objectStore("save_meta").clear();
		// Workbox owns versioned app caches; reconciliation only changes IndexedDB.
		await tx.objectStore("app_meta").put(CURRENT_APP_STORAGE_META, "current");
		await tx.done;
	} catch (error) {
		try {
			tx.abort();
		} catch {
			/* The transaction may already have aborted. */
		}
		await tx.done.catch(() => {});
		throw error;
	}
}

async function createIndexedDbFs(): Promise<IFileSystem> {
	let openedDb: IDBPDatabase<unknown> | undefined;
	try {
		if (!("indexedDB" in window)) {
			throw new Error("IndexedDB is not supported in this browser.");
		}

		const db = await openSaveDatabase((db, oldVersion) => {
			if (oldVersion < 1 && !db.objectStoreNames.contains("files")) {
				db.createObjectStore("files");
			}
			if (!db.objectStoreNames.contains("files")) {
				db.createObjectStore("files");
			}
			if (!db.objectStoreNames.contains("save_meta")) {
				db.createObjectStore("save_meta");
			}
			if (!db.objectStoreNames.contains("app_meta")) {
				db.createObjectStore("app_meta");
			}
		});
		openedDb = db;

		await reconcileStoredAppState(db);

		const files = new Map<string, Uint8Array>();
		const saveMeta = new Map<string, IPlayerInfo | null>();

		const keys = await db.getAllKeys("files");
		for (const key of keys) {
			const value = await db.get("files", key);
			if (value) {
				files.set(key as string, value as Uint8Array);
			}
		}

		const metaKeys = await db.getAllKeys("save_meta");
		for (const key of metaKeys) {
			const value = await db.get("save_meta", key);
			saveMeta.set(key as string, (value as IPlayerInfo | null) ?? null);
		}

		const setSaveMeta = async (name: string, info: IPlayerInfo | null) => {
			const key = name.toLowerCase();
			saveMeta.set(key, info);
			await db.put("save_meta", info, key);
		};

		const deleteSaveMeta = async (name: string) => {
			const key = name.toLowerCase();
			saveMeta.delete(key);
			await db.delete("save_meta", key);
		};

		const clearSaveMeta = async () => {
			saveMeta.clear();
			await db.clear("save_meta");
		};

		const updateSaveMetaFromData = async (name: string, data: Uint8Array) => {
			if (!name.endsWith(".sv")) return;
			const info = getPlayerName(toArrayBuffer(data), name);
			await setSaveMeta(name, info);
		};

		if (import.meta.env.DEV) {
			window.DownloadFile = (name: string) => downloadFile(db, name);
			window.DownloadSaves = () => downloadSaves(db);
		}

		return {
			files,
			update: async (name: string, data: Uint8Array) => {
				const key = name.toLowerCase();
				files.set(key, data);
				await db.put("files", data, key);
				await updateSaveMetaFromData(key, data);
			},
			delete: async (name: string) => {
				const key = name.toLowerCase();
				files.delete(key);
				await db.delete("files", key);
				await deleteSaveMeta(key);
			},
			clear: async () => {
				files.clear();
				await db.clear("files");
				await clearSaveMeta();
			},
			download: (name: string) => downloadFile(db, name),
			upload: async (file: File) => {
				await uploadFile(db, files, file);
				const key = file.name.toLowerCase();
				const data = files.get(key);
				if (data) {
					await updateSaveMetaFromData(key, data);
				}
			},
			fileUrl: async (name: string) => {
				// Memory contains the latest save even when persistence failed.
				const file = files.get(name.toLowerCase());
				if (file) {
					const blob = new Blob([toArrayBuffer(file)], {
						type: "binary/octet-stream",
					});
					return URL.createObjectURL(blob);
				}
				return undefined;
			},
			getSaveMeta: async () => Object.fromEntries(saveMeta.entries()),
			setSaveMeta,
			deleteSaveMeta,
			clearSaveMeta,
		};
	} catch (e) {
		openedDb?.close();
		console.error("Error initializing IndexedDB", e);
		if (import.meta.env.DEV) {
			window.DownloadFile = () => console.error("IndexedDB is not supported");
			window.DownloadSaves = () => console.error("IndexedDB is not supported");
		}

		throw e;
	}
}

let filesystemPromise: Promise<IFileSystem> | undefined;

export default function createTrackedIndexedDbFs(): Promise<IFileSystem> {
	return (filesystemPromise ??= createTrackedFilesystem());
}

function createTrackedFilesystem(): Promise<IFileSystem> {
	return pendingStorageWrites.track(
		withStorageOwnership(createIndexedDbFs).then((fs) => {
			const update = fs.update;
			const remove = fs.delete;
			const clear = fs.clear;
			const upload = fs.upload;
			const recoverFile = (name: string) => {
				const data = fs.files.get(name);
				return data ? update(name, data) : remove(name);
			};
			const trackFile = <T>(name: string, operation: Promise<T>) => {
				const key = name.toLowerCase();
				return pendingStorageWrites.track(operation, `file:${key}`, () => recoverFile(key));
			};
			fs.update = (name, data) => trackFile(name, update(name, data));
			fs.delete = (name) => trackFile(name, remove(name));
			fs.upload = (file) => trackFile(file.name, upload(file));
			const clearFiles = () =>
				clear().then(() => {
					pendingStorageWrites.resolveFailures("file:");
					pendingStorageWrites.resolveFailures("meta:");
				});
			const recoverClear = async () => {
				// A newer upload must survive retrying an earlier failed clear.
				const current = new Map(fs.files);
				try {
					await clear();
				} finally {
					for (const [name, data] of current) fs.files.set(name, data);
				}
				await Promise.all([...current].map(([name, data]) => update(name, data)));
				pendingStorageWrites.resolveFailures("file:");
				pendingStorageWrites.resolveFailures("meta:");
			};
			fs.clear = () => pendingStorageWrites.track(clearFiles(), "clear", recoverClear);
			const setMeta = fs.setSaveMeta;
			const deleteMeta = fs.deleteSaveMeta;
			const recoverMetadata = async (name: string) => {
				const current = (await fs.getSaveMeta?.())?.[name.toLowerCase()];
				if (current !== undefined) await setMeta?.(name, current);
				else await deleteMeta?.(name);
			};
			if (setMeta)
				fs.setSaveMeta = (name, info) =>
					pendingStorageWrites.track(setMeta(name, info), `meta:${name.toLowerCase()}`, () =>
						recoverMetadata(name)
					);
			if (deleteMeta)
				fs.deleteSaveMeta = (name) =>
					pendingStorageWrites.track(deleteMeta(name), `meta:${name.toLowerCase()}`, () =>
						recoverMetadata(name)
					);
			const clearMeta = fs.clearSaveMeta;
			if (clearMeta) {
				const clearMetadata = () => clearMeta().then(() => pendingStorageWrites.resolveFailures("meta:"));
				const recoverClearMetadata = async () => {
					const current = await fs.getSaveMeta?.();
					await clearMeta();
					for (const [name, info] of Object.entries(current ?? {})) await setMeta?.(name, info);
					pendingStorageWrites.resolveFailures("meta:");
				};
				fs.clearSaveMeta = () =>
					pendingStorageWrites.track(clearMetadata(), "clear-meta", recoverClearMetadata);
			}
			return fs;
		})
	);
}
