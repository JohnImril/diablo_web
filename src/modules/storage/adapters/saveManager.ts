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
	const listSaves = async (): Promise<Record<string, IPlayerInfo | null>> => {
		const fsInstance = await fs;
		const saves: Record<string, IPlayerInfo | null> = {};

		sortSaveNames([...fsInstance.files.keys()].filter((name) => isSaveFile(name))).forEach((name) => {
			const file = fsInstance.files.get(name);
			const saveName = extractSaveName(name);
			if (file && saveName) {
				saves[saveName] = getPlayerName(toArrayBuffer(file.buffer), saveName);
			}
		});

		return saves;
	};

	const notifySavesChanged = async () => {
		if (!onSavesChanged) return;
		const saves = await listSaves();
		await onSavesChanged(Object.keys(saves));
	};

	const importSave = async (file: File) => {
		const fsInstance = await fs;
		await fsInstance.upload(file);
		await notifySavesChanged();
	};

	const deleteSave = async (name: string) => {
		const fsInstance = await fs;
		await fsInstance.delete(name.toLowerCase());
		fsInstance.files.delete(name.toLowerCase());
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

	return { listSaves, importSave, deleteSave, downloadSave, loadSave };
}
