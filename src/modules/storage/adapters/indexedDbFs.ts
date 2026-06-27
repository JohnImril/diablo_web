import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { IFileSystem, IPlayerInfo } from "types";
import getPlayerName from "shared/parsers/saveFile";
import { readFileAsArrayBuffer, toArrayBuffer } from "shared/buffers";
import { triggerDownload } from "./download";
import { MAX_MPQ_SIZE, MAX_SV_SIZE } from "constants/files";
import { isSaveFile } from "../core/saveRules";

const APP_ASSET_DATA_EPOCH = import.meta.env.VITE_APP_ASSET_DATA_EPOCH || "1";
const APP_SAVE_DATA_EPOCH = import.meta.env.VITE_APP_SAVE_DATA_EPOCH || "1";
const APP_BUILD_ID = import.meta.env.VITE_APP_BUILD_ID || import.meta.env.VITE_APP_VERSION;
const APP_CACHE_NAMES = new Set(["assets-cache", "html-cache"]);
const APP_CACHE_MARKERS = ["diablo-web", "diablo_web"];

type AppStorageMeta = {
	buildId: string;
	assetDataEpoch: string | number;
	saveDataEpoch: string | number;
};

const CURRENT_APP_STORAGE_META: AppStorageMeta = {
	buildId: APP_BUILD_ID,
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

async function clearAppCaches() {
	if (!("caches" in window)) return;
	const names = await window.caches.keys();
	await Promise.all(
		names
			.filter((name) => APP_CACHE_NAMES.has(name) || APP_CACHE_MARKERS.some((marker) => name.includes(marker)))
			.map((name) => window.caches.delete(name))
	);
}

async function deleteStoredFiles(
	db: IDBPDatabase<unknown>,
	shouldDelete: (name: string) => boolean,
	files?: Map<string, Uint8Array>
) {
	const keys = await db.getAllKeys("files");
	for (const key of keys) {
		const name = String(key).toLowerCase();
		if (!shouldDelete(name)) continue;
		files?.delete(name);
		await db.delete("files", key);
	}
}

async function reconcileStoredAppState(db: IDBPDatabase<unknown>) {
	const previous = (await db.get("app_meta", "current")) as AppStorageMeta | undefined;
	const previousAssetDataEpoch = String(previous?.assetDataEpoch ?? "1");
	const previousSaveDataEpoch = String(previous?.saveDataEpoch ?? "1");
	const shouldClearAssetData =
		!previous ||
		previous.buildId !== CURRENT_APP_STORAGE_META.buildId ||
		previousAssetDataEpoch !== CURRENT_APP_STORAGE_META.assetDataEpoch;
	const shouldClearSaveData = previousSaveDataEpoch !== CURRENT_APP_STORAGE_META.saveDataEpoch;

	if (shouldClearSaveData) {
		await deleteStoredFiles(db, isSaveFile);
		await db.clear("save_meta");
	}

	if (shouldClearAssetData) {
		await deleteStoredFiles(db, (name) => !isSaveFile(name));
		await clearAppCaches();
	}

	await db.put("app_meta", CURRENT_APP_STORAGE_META, "current");
}

export default async function createIndexedDbFs(): Promise<IFileSystem> {
	try {
		if (!("indexedDB" in window)) {
			throw new Error("IndexedDB is not supported in this browser.");
		}

		const db = await openDB("diablo_fs", 4, {
			upgrade(db, oldVersion) {
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
			},
		});

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
				const file = await db.get("files", name.toLowerCase());
				if (file) {
					const blob = new Blob([file], {
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
		console.error("Error initializing IndexedDB", e);
		if (import.meta.env.DEV) {
			window.DownloadFile = () => console.error("IndexedDB is not supported");
			window.DownloadSaves = () => console.error("IndexedDB is not supported");
		}

		return {
			files: new Map<string, Uint8Array>(),
			update: () => Promise.resolve(),
			delete: () => Promise.resolve(),
			clear: () => Promise.resolve(),
			download: () => Promise.resolve(),
			upload: () => Promise.resolve(),
			fileUrl: () => Promise.resolve(undefined),
		};
	}
}
