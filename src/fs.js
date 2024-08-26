import { openDB } from "idb";

async function downloadFile(db, name) {
	const file = await db.get("files", name.toLowerCase());
	if (file) {
		const blob = new Blob([file], { type: "binary/octet-stream" });
		const url = URL.createObjectURL(blob);
		const lnk = document.createElement("a");
		lnk.setAttribute("href", url);
		lnk.setAttribute("download", name);
		document.body.appendChild(lnk);
		lnk.click();
		document.body.removeChild(lnk);
		URL.revokeObjectURL(url);
	} else {
		console.error(`File ${name} does not exist`);
	}
}

async function downloadSaves(db) {
	const keys = await db.getAllKeys("files");
	for (let name of keys) {
		if (name.match(/\.sv$/i)) {
			await downloadFile(db, name);
		}
	}
}

const readFile = (file) =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(reader.error);
		reader.onabort = () => reject();
		reader.readAsArrayBuffer(file);
	});

async function uploadFile(db, files, file) {
	const data = new Uint8Array(await readFile(file));
	files.set(file.name.toLowerCase(), data);
	await db.put("files", data, file.name.toLowerCase());
}

export default async function create_fs() {
	try {
		const db = await openDB("diablo_fs", 1, {
			upgrade(db) {
				db.createObjectStore("files");
			},
		});

		const files = new Map();

		const keys = await db.getAllKeys("files");
		for (let key of keys) {
			const value = await db.get("files", key);
			files.set(key, value);
		}

		window.DownloadFile = (name) => downloadFile(db, name);
		window.DownloadSaves = () => downloadSaves(db);
		return {
			files,
			update: (name, data) => db.put("files", data, name),
			delete: (name) => db.delete("files", name),
			clear: () => db.clear("files"),
			download: (name) => downloadFile(db, name),
			upload: (file) => uploadFile(db, files, file),
			fileUrl: async (name) => {
				const file = await db.get("files", name.toLowerCase());
				if (file) {
					const blob = new Blob([file], {
						type: "binary/octet-stream",
					});
					return URL.createObjectURL(blob);
				}
			},
		};
	} catch (e) {
		window.DownloadFile = () => console.error("IndexedDB is not supported");
		window.DownloadSaves = () => console.error("IndexedDB is not supported");
		return {
			files: new Map(),
			update: () => Promise.resolve(),
			delete: () => Promise.resolve(),
			clear: () => Promise.resolve(),
			download: () => Promise.resolve(),
			upload: () => Promise.resolve(),
			fileUrl: () => Promise.resolve(),
		};
	}
}
