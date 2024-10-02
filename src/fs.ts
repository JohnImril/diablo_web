import { openDB, IDBPDatabase } from "idb";
import { IFileSystem } from "./types";

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

function triggerDownload(url: string, name: string) {
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

async function downloadSaves(db: IDBPDatabase<unknown>) {
	const keys = await db.getAllKeys("files");
	for (const name of keys) {
		if ((name as string).match(/\.sv$/i)) {
			await downloadFile(db, name as string);
		}
	}
}

const readFile = (file: File): Promise<ArrayBuffer> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(reader.error);
		reader.onabort = () => reject();
		reader.readAsArrayBuffer(file);
	});

async function uploadFile(db: IDBPDatabase<unknown>, files: Map<string, Uint8Array>, file: File) {
	const data = new Uint8Array(await readFile(file));
	files.set(file.name.toLowerCase(), data);
	await db.put("files", data, file.name.toLowerCase());
}

export default async function create_fs(): Promise<IFileSystem> {
	try {
		if (!("indexedDB" in window)) {
			throw new Error("IndexedDB is not supported in this browser.");
		}

		const db = await openDB("diablo_fs", 2, {
			upgrade(db, oldVersion) {
				if (oldVersion < 1) {
					db.createObjectStore("files");
				} else if (oldVersion === 1) {
					if (!db.objectStoreNames.contains("files")) {
						db.createObjectStore("files");
					}
				}
			},
		});

		const files = new Map<string, Uint8Array>();

		const keys = await db.getAllKeys("files");
		for (const key of keys) {
			const value = await db.get("files", key);
			if (value) {
				files.set(key as string, value as Uint8Array);
			}
		}

		window.DownloadFile = (name: string) => downloadFile(db, name);
		window.DownloadSaves = () => downloadSaves(db);

		return {
			files,
			update: (name: string, data: Uint8Array) => db.put("files", data, name),
			delete: (name: string) => db.delete("files", name),
			clear: () => db.clear("files"),
			download: (name: string) => downloadFile(db, name),
			upload: (file: File) => uploadFile(db, files, file),
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
		};
	} catch (e) {
		console.error("Error initializing IndexedDB", e);
		window.DownloadFile = () => console.error("IndexedDB is not supported");
		window.DownloadSaves = () => console.error("IndexedDB is not supported");

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
