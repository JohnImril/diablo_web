import DiabloBinary from "./diablo.wasm?url";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import DiabloModule from "./diablo.jscc";
import SpawnBinary from "./diabloSpawn.wasm?url";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import SpawnModule from "./diabloSpawn.jscc";
import websocket_open from "../../network/adapters/webSocketClient";
import type { IWebSocketProxy } from "../../../types";
import { fetchWithProgress } from "./fetchWithProgress";
import { PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage } from "../core/protocol";

const DiabloSize = 1466809;
const SpawnSize = 1337416;

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:8787/ws";

const worker: WorkerContext = self as unknown as WorkerContext;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type WorkerToMainMessagePayload = DistributiveOmit<WorkerToMainMessage, "v" | "type">;

const withProtocol = (message: WorkerToMainMessagePayload): WorkerToMainMessage => {
	return {
		...message,
		v: PROTOCOL_VERSION,
		type: message.action,
	} as WorkerToMainMessage;
};

const postToMain = <T extends WorkerToMainMessage>(message: T, transfer?: Transferable[]) => {
	if (transfer) {
		worker.postMessage(message, transfer);
	} else {
		worker.postMessage(message);
	}
};

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let imageData: ImageData | null = null;
let files: FileMap | null = null;
let renderBatch: {
	images: { x: number; y: number; w: number; h: number; data: Uint8Array }[];
	text: { x: number; y: number; text: string; color: number }[];
	clip: { x0: number; y0: number; x1: number; y1: number } | null;
	belt: Uint8Array | null;
} | null = null;
let drawBelt: Uint8Array | null = null;
let is_spawn = false;
let websocket: IWebSocketProxy | null = null;

function onError(err: unknown, action: "error" | "failed" = "error") {
	if (err instanceof Error) {
		postToMain(withProtocol({ action, error: err.toString(), stack: err.stack }));
	} else {
		postToMain(withProtocol({ action, error: err?.toString?.() ?? String(err) }));
	}
}

const ChunkSize = 1 << 20;

type RemoteFile = ReturnType<typeof createRemoteFile>;

const createRemoteFile = (url: string) => {
	const request = new XMLHttpRequest();
	request.open("HEAD", url, false);
	request.send();
	if (request.status < 200 || request.status >= 300) {
		throw Error("Failed to load remote file");
	}

	const byteLength = parseInt(request.getResponseHeader("Content-Length") || "0");
	const buffer = new Uint8Array(byteLength);
	const chunks = new Uint8Array(((byteLength + ChunkSize - 1) >> 20) | 0);

	const ensureRange = (start: number, end: number) => {
		let chunk0 = (start / ChunkSize) | 0;
		let chunk1 = ((end + ChunkSize - 1) / ChunkSize) | 0;
		let missing0 = chunk1;
		let missing1 = chunk0;

		for (let i = chunk0; i < chunk1; ++i) {
			if (!chunks[i]) {
				missing0 = Math.min(missing0, i);
				missing1 = Math.max(missing1, i);
			}
		}

		if (missing0 > missing1) return;

		const rangeRequest = new XMLHttpRequest();
		rangeRequest.open("GET", url, false);
		rangeRequest.setRequestHeader(
			"Range",
			`bytes=${missing0 * ChunkSize}-${Math.min(missing1 * ChunkSize + ChunkSize - 1, byteLength - 1)}`
		);
		rangeRequest.responseType = "arraybuffer";
		rangeRequest.send();
		if (rangeRequest.status < 200 || rangeRequest.status >= 300) {
			throw Error("Failed to load remote file");
		}

		const header = rangeRequest.getResponseHeader("Content-Range");
		let offset = 0;
		const match = header?.match(/bytes (\d+)-(\d+)\/(\d+)/);
		if (match) {
			offset = parseInt(match[1]);
		}

		buffer.set(new Uint8Array(rangeRequest.response), offset);
		chunk0 = ((offset + ChunkSize - 1) / ChunkSize) | 0;
		chunk1 = ((offset + rangeRequest.response.byteLength + ChunkSize - 1) / ChunkSize) | 0;
		for (let i = chunk0; i < chunk1; ++i) {
			chunks[i] = 1;
		}
	};

	const subarray = (start: number, end: number) => {
		ensureRange(start, end);
		return buffer.subarray(start, end);
	};

	return {
		byteLength,
		url,
		buffer,
		chunks,
		subarray,
	};
};

const DApi: IDApi = {
	exit_error(error: string) {
		throw Error(error);
	},

	exit_game() {
		postToMain(withProtocol({ action: "exit" }));
	},

	current_save_id(id: number) {
		postToMain(
			withProtocol({
				action: "current_save",
				name: id >= 0 ? (is_spawn ? `spawn${id}.sv` : `single_${id}.sv`) : null,
			})
		);
	},

	get_file_size(path: string) {
		const data = files?.get(path.toLowerCase());
		return data ? data.byteLength : 0;
	},

	get_file_contents(path: string, array: Uint8Array, offset: number) {
		const data = files?.get(path.toLowerCase());
		if (data) {
			array.set(data.subarray(offset, offset + array.byteLength));
		}
	},

	put_file_contents(path: string, array: Uint8Array) {
		path = path.toLowerCase();
		files?.set(path, array);
		postToMain(withProtocol({ action: "fs", func: "update", params: [path, array] }));
	},

	remove_file(path: string) {
		path = path.toLowerCase();
		files?.delete(path);
		postToMain(withProtocol({ action: "fs", func: "delete", params: [path] }));
	},

	set_cursor(x: number, y: number) {
		postToMain(withProtocol({ action: "cursor", x, y }));
	},

	open_keyboard(...args: number[]) {
		postToMain(withProtocol({ action: "keyboard", rect: [...args] }));
	},

	close_keyboard() {
		postToMain(withProtocol({ action: "keyboard", rect: null }));
	},

	use_websocket(flag: boolean) {
		if (flag) {
			if (!websocket || websocket.readyState !== 1) {
				const sock = (websocket = websocket_open(
					WS_URL,
					(data) => {
						if (websocket === sock) {
							try_api(() => {
								const ab = data as ArrayBuffer;
								const ptr = wasm!._DApi_AllocPacket(ab.byteLength);
								wasm!.HEAPU8.set(new Uint8Array(ab), ptr);
							});
						}
					},
					(code) => {
						if (typeof code !== "number") throw code;
						call_api("SNet_WebsocketStatus", code);
					}
				));
			} else {
				call_api("SNet_WebsocketStatus", 0);
			}
		} else {
			if (websocket) {
				websocket.close();
			}
			websocket = null;
		}
	},

	websocket_closed() {
		return websocket ? websocket.readyState !== 1 : false;
	},
};

const DApi_renderLegacy = {
	draw_begin() {
		renderBatch = {
			images: [],
			text: [],
			clip: null,
			belt: drawBelt,
		};
		drawBelt = null;
	},

	draw_blit(x: number, y: number, w: number, h: number, data: Uint8Array) {
		renderBatch?.images.push({ x, y, w, h, data: data.slice() });
	},

	draw_clip_text(x0: number, y0: number, x1: number, y1: number) {
		renderBatch!.clip = { x0, y0, x1, y1 };
	},

	draw_text(x: number, y: number, text: string, color: number) {
		renderBatch?.text.push({ x, y, text, color });
	},

	draw_end() {
		const transfer = renderBatch?.images.map(({ data }) => data.buffer) ?? [];
		if (renderBatch?.belt) transfer.push(renderBatch.belt.buffer);

		postToMain(withProtocol({ action: "render", batch: renderBatch }), transfer as Transferable[]);
		renderBatch = null;
	},

	draw_belt(items: Uint8Array) {
		drawBelt = items.slice();
	},
};

const DApi_renderOffscreen = {
	draw_begin() {
		if (context) {
			context.save();
			context.font = "bold 13px Times New Roman";
		}
	},

	draw_blit(x: number, y: number, _w: number, _h: number, data: Uint8Array) {
		if (context && imageData) {
			imageData.data.set(data);
			context.putImageData(imageData, x, y);
		}
	},

	draw_clip_text(x0: number, y0: number, x1: number, y1: number) {
		if (context) {
			context.beginPath();
			context.rect(x0, y0, x1 - x0, y1 - y0);
			context.clip();
		}
	},

	draw_text(x: number, y: number, text: string, color: number) {
		if (context) {
			const r = (color >> 16) & 0xff;
			const g = (color >> 8) & 0xff;
			const b = color & 0xff;
			context.fillStyle = `rgb(${r}, ${g}, ${b})`;
			context.fillText(text, x, y + 22);
		}
	},

	draw_end() {
		if (context && canvas) {
			context.restore();
			const bitmap = canvas.transferToImageBitmap();
			const transfer: Transferable[] = [bitmap];
			if (drawBelt) transfer.push(drawBelt.buffer);
			postToMain(withProtocol({ action: "render", batch: { bitmap, belt: drawBelt } }), transfer);
			drawBelt = null;
		}
	},

	draw_belt(items: Uint8Array) {
		drawBelt = items.slice();
	},
};

let audioBatch: unknown[] | null = null;
let audioTransfer: Transferable[] | null = null;
let maxSoundId = 0;
let maxBatchId = 0;

(["create_sound_raw", "create_sound", "duplicate_sound"] as const).forEach((func) => {
	DApi[func] = function (...params: [number, Uint8Array]) {
		if (audioBatch) {
			maxBatchId = params[0] + 1;
			audioBatch.push({ func, params });
			if (func !== "duplicate_sound") {
				audioTransfer!.push(params[1].buffer);
			}
		} else {
			maxSoundId = params[0] + 1;
			const transfer: Transferable[] = [];
			if (func !== "duplicate_sound") {
				transfer.push(params[1].buffer);
			}
			postToMain(withProtocol({ action: "audio", func, params }), transfer);
		}
	};
});

(["play_sound", "set_volume", "stop_sound", "delete_sound"] as const).forEach((func) => {
	DApi[func] = function (...params: [number, ...unknown[]]) {
		if (audioBatch && params[0] >= maxSoundId) {
			audioBatch.push({ func, params });
		} else {
			postToMain(withProtocol({ action: "audio", func, params }));
		}
	};
});

let packetBatch: ArrayBuffer[] | null = null;

DApi.websocket_send = function (data: Uint8Array) {
	if (websocket) {
		websocket.send(data);
	} else if (packetBatch) {
		packetBatch.push(data.slice().buffer);
	} else {
		postToMain(withProtocol({ action: "packet", buffer: data }));
	}
};

worker.DApi = DApi as typeof DApi;

let wasm: WasmApi | null = null;

function try_api(func: () => void) {
	try {
		func();
	} catch (e) {
		onError(e);
	}
}

function call_api(func: string, ...params: (string | number)[]) {
	try_api(() => {
		const nested = audioBatch != null;
		if (!nested) {
			audioBatch = [];
			audioTransfer = [];
			packetBatch = [];
		}

		if (func !== "text") {
			(wasm as { [key: string]: (...args: unknown[]) => unknown })["_" + func](...params);
		} else {
			const ptr = wasm!._DApi_SyncTextPtr();
			const text = params[0] as string;
			const length = Math.min(text.length, 255);
			const heap = wasm!.HEAPU8;
			for (let i = 0; i < length; ++i) {
				heap[ptr + i] = text.charCodeAt(i);
			}
			heap[ptr + length] = 0;
			wasm!._DApi_SyncText(params[1] as number);
		}
		if (!nested) {
			if (audioBatch!.length) {
				maxSoundId = maxBatchId;
				postToMain(withProtocol({ action: "audioBatch", batch: audioBatch as unknown[] }), audioTransfer!);
			}
			if (packetBatch!.length) {
				postToMain(withProtocol({ action: "packetBatch", batch: packetBatch as ArrayBuffer[] }), packetBatch!);
			}
			audioBatch = null;
			audioTransfer = null;
			packetBatch = null;
		}
	});
}

function progress(text: string, loaded?: number, total?: number) {
	postToMain(withProtocol({ action: "progress", text, loaded: loaded as number, total: total as number }));
}

const readFile = (file: File, progressCb?: (e: ProgressEvent<FileReader>) => void) =>
	new Promise<ArrayBuffer>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (progressCb) {
				progressCb({ loaded: file.size } as ProgressEvent<FileReader>);
			}
			resolve(reader.result as ArrayBuffer);
		};
		reader.onerror = () => reject(reader.error);
		reader.onabort = () => reject();
		if (progressCb) {
			reader.addEventListener("progress", progressCb);
		}
		reader.readAsArrayBuffer(file);
	});

async function initWasm(spawn: boolean, progressCb: (e: { loaded: number; total?: number }) => void) {
	const binary = await fetchWithProgress(spawn ? SpawnBinary : DiabloBinary, (loaded, total) =>
		progressCb({ loaded, total })
	);

	const result = await (spawn ? SpawnModule : DiabloModule)({
		wasmBinary: binary,
	}).ready;

	progressCb({ loaded: 2000000 });
	return result as WasmApi;
}

async function init_game(mpq: File | null, spawn: boolean, offscreen: boolean) {
	is_spawn = spawn;
	if (offscreen) {
		canvas = new OffscreenCanvas(640, 480);
		context = canvas.getContext("2d")!;
		imageData = context.createImageData(640, 480);
		Object.assign(DApi, DApi_renderOffscreen);
	} else {
		Object.assign(DApi, DApi_renderLegacy);
	}

	if (!mpq) {
		const name = spawn ? "spawn.mpq" : "diabdat.mpq";
		if (!files!.has(name)) {
			const base =
				import.meta.env.BASE_URL === "/"
					? ""
					: import.meta.env.BASE_URL.endsWith("/")
						? import.meta.env.BASE_URL.slice(0, -1)
						: import.meta.env.BASE_URL;

			files!.set(name, createRemoteFile(`${base}/${name}`));
		}
	}

	progress("Loading...");

	let mpqLoaded = 0;
	const mpqTotal = mpq ? mpq.size : 0;
	let wasmLoaded = 0;
	const wasmTotal = spawn ? SpawnSize : DiabloSize;
	const wasmWeight = 5;

	function updateProgress() {
		progress("Loading...", mpqLoaded + wasmLoaded * wasmWeight, mpqTotal + wasmTotal * wasmWeight);
	}

	const loadWasm = initWasm(spawn, (e) => {
		wasmLoaded = Math.min(e.loaded, wasmTotal);
		updateProgress();
	});

	const loadMpq = mpq
		? readFile(mpq, (e) => {
				const progressEvent = e as ProgressEvent<FileReader> & { loadedBytes?: number };
				mpqLoaded = progressEvent.loaded ?? progressEvent.loadedBytes ?? mpqLoaded;
				updateProgress();
			})
		: Promise.resolve<ArrayBuffer | null>(null);

	const [wasmResult, mpqBuf] = await Promise.all([loadWasm, loadMpq]);
	wasm = wasmResult;

	if (mpqBuf) {
		files!.set(spawn ? "spawn.mpq" : "diabdat.mpq", new Uint8Array(mpqBuf));
	}

	progress("Initializing...");

	const vers = import.meta.env.VITE_APP_VERSION.match(/(\d+)\.(\d+)\.(\d+)/);

	wasm!._SNet_InitWebsocket();

	wasm!._DApi_Init(
		Math.floor(performance.now()),
		offscreen ? 1 : 0,
		parseInt(vers![1]),
		parseInt(vers![2]),
		parseInt(vers![3])
	);

	setInterval(() => {
		call_api("DApi_Render", Math.floor(performance.now()));
	}, 50);
}

worker.addEventListener("message", ({ data }: MessageEvent<MainToWorkerMessage>) => {
	switch (data.action) {
		case "init":
			files = data.files;
			init_game(data.mpq, data.spawn, data.offscreen).then(
				() => postToMain(withProtocol({ action: "loaded" })),
				(e) => onError(e, "failed")
			);
			break;
		case "event":
			call_api(data.func, ...data.params);
			break;
		case "packet":
			try_api(() => {
				const ptr = wasm!._DApi_AllocPacket(data.buffer.byteLength);
				wasm!.HEAPU8.set(new Uint8Array(data.buffer), ptr);
			});
			break;
		case "packetBatch":
			try_api(() => {
				for (const packet of data.batch) {
					const ptr = wasm!._DApi_AllocPacket(packet.byteLength);
					wasm!.HEAPU8.set(new Uint8Array(packet), ptr);
				}
			});
			break;
		default:
			break;
	}
});

export default null;

type FileMap = Map<string, Uint8Array | RemoteFile>;

interface WorkerContext extends Worker {
	DApi: typeof DApi;
}

interface IDApi {
	exit_error(error: string): never;
	exit_game(): void;
	current_save_id(id: number): void;
	get_file_size(path: string): number;
	get_file_contents(path: string, array: Uint8Array, offset: number): void;
	put_file_contents(path: string, array: Uint8Array): void;
	remove_file(path: string): void;
	set_cursor(x: number, y: number): void;
	open_keyboard(...args: number[]): void;
	close_keyboard(): void;
	use_websocket(flag: boolean): void;
	websocket_closed(): boolean;
	websocket_send?(data: Uint8Array): void;
	[key: string]: unknown;
}

interface WasmApi {
	[key: string]: unknown;
	_DApi_AllocPacket(size: number): number;
	HEAPU8: Uint8Array;
	_DApi_SyncTextPtr(): number;
	_DApi_SyncText(ptr: number): void;
	_SNet_InitWebsocket(): void;
	_DApi_Init(time: number, offscreen: number, major: number, minor: number, patch: number): void;
	_DApi_Render(time: number): void;
}
