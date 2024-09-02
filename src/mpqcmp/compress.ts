import axios, { AxiosProgressEvent } from "axios";

import { decrypt, encrypt, hash, path_name } from "../api/savefile";
import Worker from "./mpqcmp.worker.js?worker";
import MpqBinary from "./MpqCmp.wasm?url";
import ListFile from "./ListFile.txt";

const MpqSize = 156977;
const ListSize = 75542;

const readFile = (file: File, progress?: (e: ProgressEvent) => void) =>
	new Promise<ArrayBuffer>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			progress?.({ loaded: file.size } as ProgressEvent);
			resolve(reader.result as ArrayBuffer);
		};
		reader.onerror = () => reject(reader.error);
		reader.onabort = () => reject();
		if (progress) {
			reader.addEventListener("progress", progress);
		}
		reader.readAsArrayBuffer(file);
	});

async function loadFile(
	url: string,
	progress?: (e: ProgressEvent) => void,
	responseType: "arraybuffer" | "text" = "arraybuffer"
) {
	const { data } = await axios.request<ArrayBuffer | string>({
		url,
		responseType,
		onDownloadProgress: progress as unknown as (e: AxiosProgressEvent) => void,
	});
	return data;
}

function runWorker(data: unknown, transfer: Transferable[], progress: (value: number) => void) {
	return new Promise<IWorkerResult>((resolve, reject) => {
		try {
			const worker = new Worker();

			worker.addEventListener("message", ({ data }) => {
				switch (data.action) {
					case "result":
						resolve({ buffer: data.buffer, blocks: data.blocks });
						break;
					case "error":
						reject({ message: data.error, stack: data.stack });
						break;
					case "progress":
						progress(data.value);
						break;
					default:
				}
			});
			worker.postMessage({ action: "run", ...(data as object) }, transfer);
		} catch (e) {
			reject(e);
		}
	});
}

export default async function compress(mpq: File, progress: (text: string, loaded?: number, total?: number) => void) {
	progress("Loading...");
	const files: IFileLoad[] = [];

	const updateProgress = () =>
		progress(
			"Loading...",
			files.reduce((sum, { loaded, weight }) => sum + loaded * weight, 0),
			files.reduce((sum, { total, weight }) => sum + total * weight, 0)
		);

	const loader = (file: IFileLoad) => (e: ProgressEvent) => {
		file.loaded = e.loaded;
		updateProgress();
	};

	const mpqsize = mpq.size;

	const fHeader: IFileLoad = { loaded: 0, weight: 1, total: mpqsize };
	fHeader.ready = readFile(mpq.slice(0, 32) as File, loader(fHeader));
	files.push(fHeader);

	const fBinary: IFileLoad = { loaded: 0, weight: 5, total: MpqSize };
	fBinary.ready = loadFile(MpqBinary, loader(fBinary));
	files.push(fBinary);

	const fList: IFileLoad = { loaded: 0, weight: 5, total: ListSize };
	fList.ready = loadFile(ListFile, loader(fList), "text");
	files.push(fList);

	const header = new Uint32Array((await fHeader.ready) as ArrayBuffer);
	const header16 = new Uint16Array(header.buffer);

	if (header[0] !== 0x1a51504d) {
		throw new Error("invalid MPQ file");
	}

	const blockSize = 1 << (9 + header16[7]);
	const hashTablePos = header[4];
	const blockTablePos = header[5];
	const hashTableSize = header[6];
	const blockTableSize = header[7];
	if (hashTablePos + hashTableSize * 16 > mpqsize || blockTablePos + blockTableSize * 16 > mpqsize) {
		throw new Error("invalid MPQ file");
	}

	const fHashTable: IFileLoad = { loaded: 0, weight: 1, total: hashTableSize * 16 };
	const fBlockTable: IFileLoad = { loaded: 0, weight: 1, total: blockTableSize * 16 };
	fHeader.total -= fHashTable.total + fBlockTable.total;
	fHashTable.ready = readFile(mpq.slice(hashTablePos, hashTablePos + fHashTable.total) as File, loader(fHashTable));
	fBlockTable.ready = readFile(
		mpq.slice(blockTablePos, blockTablePos + fBlockTable.total) as File,
		loader(fBlockTable)
	);
	files.push(fHashTable, fBlockTable);

	const hashTable = new Uint32Array((await fHashTable.ready) as ArrayBuffer);
	const blockTable = new Uint32Array((await fBlockTable.ready) as ArrayBuffer);
	decrypt(hashTable, hash("(hash table)", 3));
	decrypt(blockTable, hash("(block table)", 3));

	const list = ((await fList.ready) as string)
		.split("\n")
		.map((name) => name.trim())
		.filter((name) => name.length);

	const listMap: Record<string, string> = {};
	const hashStr = (h1: number, h2: number) => h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");

	list.forEach((name) => {
		listMap[hashStr(hash(name, 1), hash(name, 2))] = name;
	});

	const NUM_TASKS = 4;
	const tasks: ITask[] = Array(NUM_TASKS)
		.fill(0)
		.map(() => ({
			entries: [],
			min: mpqsize,
			max: 0,
			progress: 0,
		}));

	for (let i = 0; i < hashTable.length / 4; ++i) {
		const index = hashTable[i * 4 + 3];
		if (index === 0xffffffff || index === 0xfffffffe) continue;
		const name = listMap[hashStr(hashTable[i * 4], hashTable[i * 4 + 1])];
		if (!name) {
			hashTable[i * 4 + 3] = 0xfffffffe;
			continue;
		}

		const filePos = blockTable[index * 4];
		const cSize = blockTable[index * 4 + 1];

		const task = tasks[Math.floor((filePos * NUM_TASKS) / mpqsize)];
		task.entries.push(i);
		task.min = Math.min(task.min, filePos);
		task.max = Math.max(task.max, filePos + cSize);
	}

	const numFiles = tasks.reduce((sum, task) => sum + task.entries.length, 0);

	fHeader.total = 32;
	tasks.forEach((task) => {
		if (task.min < task.max) {
			const fLoad: IFileLoad = { loaded: 0, weight: 1, total: task.max - task.min };
			task.ready = readFile(mpq.slice(task.min, task.max) as File, loader(fLoad)).then(
				(data) => (task.data = data)
			);
			files.push(fLoad);
		}
	});

	await Promise.all(tasks.map((t) => t.ready).filter(Boolean));
	const binary = (await fBinary.ready) as ArrayBuffer;

	progress("Processing...");

	tasks.forEach((task) => {
		if (task.data) {
			const input = new Uint32Array(task.entries.length * 6);
			task.entries.forEach((i, pos) => {
				const index = hashTable[i * 4 + 3];
				const name = listMap[hashStr(hashTable[i * 4], hashTable[i * 4 + 1])];
				input[pos * 6] = blockTable[index * 4];
				input[pos * 6 + 1] = blockTable[index * 4 + 1];
				input[pos * 6 + 2] = blockTable[index * 4 + 2];
				input[pos * 6 + 3] = blockTable[index * 4 + 3];
				input[pos * 6 + 4] = hash(path_name(name), 3);
				input[pos * 6 + 5] = name.match(/\.wav$/i) ? 1 : 0;
			});
			task.run = runWorker(
				{ binary, mpq: task.data, input, offset: task.min, blockSize },
				[task.data, input.buffer],
				(value) => {
					task.progress = value;
					const sum = tasks.reduce((sum, task) => sum + task.progress, 0);
					progress("Processing...", sum, numFiles);
				}
			).then((res) => (task.result = res));
		}
	});

	await Promise.all(tasks.map((t) => t.run).filter(Boolean));

	let outputPos = 32 + fHashTable.total + fBlockTable.total;
	const outputSize = tasks.reduce((sum, { result }) => sum + (result ? result.buffer.byteLength : 0), outputPos);
	const output = [header.buffer, hashTable.buffer, blockTable.buffer];

	blockTable.fill(0);
	let blockPos = 0;
	tasks.forEach((task) => {
		if (task.result) {
			const { buffer, blocks } = task.result;
			task.entries.forEach((i, pos) => {
				hashTable[i * 4 + 3] = blockPos + pos;
				blocks[pos * 4] += outputPos;
			});
			blockTable.set(blocks, blockPos * 4);
			blockPos += task.entries.length;
			output.push(buffer);
			outputPos += buffer.byteLength;
		}
	});

	header[1] = 32;
	header[2] = outputSize;
	header16[6] = 1;
	header16[7] = 7;
	header[4] = 32;
	header[5] = 32 + hashTable.length * 4;
	header[6] = hashTable.length / 4;
	header[7] = blockTable.length / 4;

	encrypt(hashTable, hash("(hash table)", 3));
	encrypt(blockTable, hash("(block table)", 3));

	return new Blob(output, { type: "binary/octet-stream" });
}

interface ITask {
	entries: number[];
	min: number;
	max: number;
	progress: number;
	data?: ArrayBuffer;
	run?: Promise<IWorkerResult>;
	ready?: Promise<ArrayBuffer>;
	result?: IWorkerResult;
}

interface IWorkerResult {
	buffer: ArrayBuffer;
	blocks: Uint32Array;
}

interface IFileLoad {
	loaded: number;
	weight: number;
	total: number;
	ready?: Promise<ArrayBuffer | string>;
}
