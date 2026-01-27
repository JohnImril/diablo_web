import getPlayerName from "../../../shared/parsers/saveFile";
import type { IFileSystem, IPlayerInfo } from "../../../types";
import { toArrayBuffer } from "../../../shared/buffers";
import { extractSaveName, isSaveFile, sortSaveNames } from "../core/saveRules";
import { downloadFile } from "./download";

export type SaveManagerOptions = {
	fs: Promise<IFileSystem>;
	onSavesChanged?: (names: string[]) => void | Promise<void>;
};

export function createSaveManager({ fs, onSavesChanged }: SaveManagerOptions) {
	type SaveCacheEntry = {
		data: Uint8Array;
		info: IPlayerInfo | null;
	};
	const saveCache = new Map<string, SaveCacheEntry>();

	const listSaveNames = async (): Promise<string[]> => {
		const fsInstance = await fs;
		const names = new Set<string>();
		if (fsInstance.getSaveMeta) {
			const meta = await fsInstance.getSaveMeta();
			for (const name of Object.keys(meta)) {
				names.add(name);
			}
		}
		for (const name of fsInstance.files.keys()) {
			if (isSaveFile(name)) {
				names.add(name);
			}
		}
		return sortSaveNames([...names]);
	};

	const listSaves = async (): Promise<Record<string, IPlayerInfo | null>> => {
		const fsInstance = await fs;
		const saves: Record<string, IPlayerInfo | null> = {};
		const meta = fsInstance.getSaveMeta ? await fsInstance.getSaveMeta() : null;

		const names = await listSaveNames();
		for (const name of names) {
			const fromMeta = meta?.[name];
			if (fromMeta !== undefined) {
				const saveName = extractSaveName(name);
				if (saveName) {
					if (!fsInstance.files.has(name)) {
						if (fsInstance.deleteSaveMeta) {
							await fsInstance.deleteSaveMeta(name);
						}
						continue;
					}
					saves[saveName] = fromMeta;
					continue;
				}
			}
			const file = fsInstance.files.get(name);
			const saveName = extractSaveName(name);
			if (!file || !saveName) continue;
			const cached = saveCache.get(name);
			if (cached && cached.data === file) {
				saves[saveName] = cached.info;
				continue;
			}
			const info = getPlayerName(toArrayBuffer(file.buffer), saveName);
			saveCache.set(name, { data: file, info });
			if (fsInstance.setSaveMeta) {
				await fsInstance.setSaveMeta(name, info);
			}
			saves[saveName] = info;
		}

		return saves;
	};

	const notifySavesChanged = async () => {
		if (!onSavesChanged) return;
		const names = await listSaveNames();
		await onSavesChanged(names);
	};

	const importSave = async (file: File) => {
		const fsInstance = await fs;
		await fsInstance.upload(file);
		saveCache.delete(file.name.toLowerCase());
		await notifySavesChanged();
	};

	const deleteSave = async (name: string) => {
		const fsInstance = await fs;
		const key = name.toLowerCase();
		saveCache.delete(key);
		await fsInstance.delete(key);
		fsInstance.files.delete(key);
		await notifySavesChanged();
	};

	const downloadSave = async (name: string) => {
		const fsInstance = await fs;
		const key = name.toLowerCase();
		const data = fsInstance.files.get(key);
		if (!data) {
			console.error(`File ${name} does not exist`);
			return;
		}
		downloadFile(name, data);
	};

	const loadSave = async (name: string) => {
		const fsInstance = await fs;
		await fsInstance.download(name);
	};

	return { listSaveNames, listSaves, importSave, deleteSave, downloadSave, loadSave };
}
