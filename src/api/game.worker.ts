import axios, { AxiosProgressEvent } from "axios";

import DiabloBinary from "./Diablo.wasm?url";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import DiabloModule from "./Diablo.jscc";
import SpawnBinary from "./DiabloSpawn.wasm?url";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import SpawnModule from "./DiabloSpawn.jscc";
import websocket_open from "./websocket";
import { IWebSocketProxy } from "../types";

const DiabloSize = 1466809;
const SpawnSize = 1337416;

const worker: WorkerContext = self as unknown as WorkerContext;

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

function onError(err: unknown, action = "error") {
	if (err instanceof Error) {
		worker.postMessage({ action, error: err.toString(), stack: err.stack });
	} else {
		worker.postMessage({ action, error: err!.toString() });
	}
}

const ChunkSize = 1 << 20;

class RemoteFile {
	byteLength: number;
	url: string;
	buffer: Uint8Array;
	chunks: Uint8Array;

	constructor(url: string) {
		const request = new XMLHttpRequest();
		request.open("HEAD", url, false);
		request.send();
		if (request.status < 200 || request.status >= 300) {
			throw Error("Failed to load remote file");
		}
		this.byteLength = parseInt(request.getResponseHeader("Content-Length") || "0");
		this.url = url;
		this.buffer = new Uint8Array(this.byteLength);
		this.chunks = new Uint8Array(((this.byteLength + ChunkSize - 1) >> 20) | 0);
	}

	subarray(start: number, end: number) {
		let chunk0 = (start / ChunkSize) | 0;
		let chunk1 = ((end + ChunkSize - 1) / ChunkSize) | 0;
		let missing0 = chunk1,
			missing1 = chunk0;
		for (let i = chunk0; i < chunk1; ++i) {
			if (!this.chunks[i]) {
				missing0 = Math.min(missing0, i);
				missing1 = Math.max(missing1, i);
			}
		}
		if (missing0 <= missing1) {
			const request = new XMLHttpRequest();
			request.open("GET", this.url, false);
			request.setRequestHeader(
				"Range",
				`bytes=${missing0 * ChunkSize}-${Math.min(missing1 * ChunkSize + ChunkSize - 1, this.byteLength - 1)}`
			);
			request.responseType = "arraybuffer";
			request.send();
			if (request.status < 200 || request.status >= 300) {
				throw Error("Failed to load remote file");
			} else {
				const header = request.getResponseHeader("Content-Range");
				let m,
					start = 0;
				if (header && (m = header.match(/bytes (\d+)-(\d+)\/(\d+)/))) {
					start = parseInt(m[1]);
				}
				this.buffer.set(new Uint8Array(request.response), start);
				chunk0 = ((start + ChunkSize - 1) / ChunkSize) | 0;
				chunk1 = ((start + request.response.byteLength + ChunkSize - 1) / ChunkSize) | 0;
				for (let i = chunk0; i < chunk1; ++i) {
					this.chunks[i] = 1;
				}
			}
		}
		return this.buffer.subarray(start, end);
	}
}

const DApi: IDApi = {
	exit_error(error: string) {
		throw Error(error);
	},

	exit_game() {
		worker.postMessage({ action: "exit" });
	},

	current_save_id(id: number) {
		worker.postMessage({
			action: "current_save",
			name: id >= 0 ? (is_spawn ? `spawn${id}.sv` : `single_${id}.sv`) : null,
		});
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
		worker.postMessage({
			action: "fs",
			func: "update",
			params: [path, array],
		});
	},

	remove_file(path: string) {
		path = path.toLowerCase();
		files?.delete(path);
		worker.postMessage({ action: "fs", func: "delete", params: [path] });
	},

	set_cursor(x: number, y: number) {
		worker.postMessage({ action: "cursor", x, y });
	},

	open_keyboard(...args: number[]) {
		worker.postMessage({ action: "keyboard", rect: [...args] });
	},

	close_keyboard() {
		worker.postMessage({ action: "keyboard", rect: null });
	},

	use_websocket(flag: boolean) {
		if (flag) {
			if (!websocket || websocket.readyState !== 1) {
				const sock = (websocket = websocket_open(
					"wss://diablo.rivsoft.net/websocket",
					(data) => {
						if (websocket === sock) {
							try_api(() => {
								const ptr = wasm._DApi_AllocPacket((data as ArrayBuffer).byteLength);
								wasm.HEAPU8.set(new Uint8Array(data as ArrayBuffer), ptr);
							});
						}
					},
					(code) => {
						if (typeof code !== "number") {
							throw code;
						} else {
							call_api("SNet_WebsocketStatus", code);
						}
					}
				)) as WebSocket;
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
		const transfer = renderBatch?.images.map(({ data }) => data.buffer);
		if (renderBatch?.belt) {
			transfer?.push(renderBatch.belt.buffer);
		}
		worker.postMessage({ action: "render", batch: renderBatch }, transfer as Transferable[]);
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
			if (drawBelt) {
				transfer.push(drawBelt.buffer);
			}
			worker.postMessage({ action: "render", batch: { bitmap, belt: drawBelt } }, transfer);
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

["create_sound_raw", "create_sound", "duplicate_sound"].forEach((func) => {
	DApi[func] = function (...params: any[]) {
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
			worker.postMessage({ action: "audio", func, params }, transfer);
		}
	};
});

["play_sound", "set_volume", "stop_sound", "delete_sound"].forEach((func) => {
	DApi[func as keyof typeof DApi] = function (...params: any[]) {
		if (audioBatch && params[0] >= maxSoundId) {
			audioBatch.push({ func, params });
		} else {
			worker.postMessage({ action: "audio", func, params });
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
		worker.postMessage({ action: "packet", buffer: data });
	}
};

worker.DApi = DApi as typeof DApi;

let wasm: any | null = null;

function try_api(func: () => void) {
	try {
		func();
	} catch (e) {
		onError(e);
	}
}

function call_api(func: string, ...params: any[]) {
	try_api(() => {
		const nested = audioBatch != null;
		if (!nested) {
			audioBatch = [];
			audioTransfer = [];
			packetBatch = [];
		}
		if (func !== "text") {
			wasm!["_" + func](...params);
		} else {
			const ptr = wasm!._DApi_SyncTextPtr();
			const text = params[0];
			const length = Math.min(text.length, 255);
			const heap = wasm!.HEAPU8;
			for (let i = 0; i < length; ++i) {
				heap[ptr + i] = text.charCodeAt(i);
			}
			heap[ptr + length] = 0;
			wasm!._DApi_SyncText(params[1]);
		}
		if (!nested) {
			if (audioBatch!.length) {
				maxSoundId = maxBatchId;
				worker.postMessage({ action: "audioBatch", batch: audioBatch }, audioTransfer!);
			}
			if (packetBatch!.length) {
				worker.postMessage({ action: "packetBatch", batch: packetBatch }, packetBatch!);
			}
			audioBatch = null;
			audioTransfer = null;
			packetBatch = null;
		}
	});
}

function progress(text: string, loaded?: number, total?: number) {
	worker.postMessage({ action: "progress", text, loaded, total });
}

const readFile = (file: File, progress?: (e: ProgressEvent<FileReader>) => void) =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (progress) {
				progress({ loaded: file.size } as ProgressEvent<FileReader>);
			}
			resolve(reader.result as ArrayBuffer);
		};
		reader.onerror = () => reject(reader.error);
		reader.onabort = () => reject();
		if (progress) {
			reader.addEventListener("progress", progress);
		}
		reader.readAsArrayBuffer(file);
	});

async function initWasm(spawn: boolean, progress: (e: AxiosProgressEvent) => void) {
	const binary = await axios.request({
		url: spawn ? SpawnBinary : DiabloBinary,
		responseType: "arraybuffer",
		onDownloadProgress: progress,
	});

	const result = await (spawn ? SpawnModule : DiabloModule)({
		wasmBinary: binary.data,
	}).ready;
	progress({ loaded: 2000000 } as AxiosProgressEvent);
	return result;
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
			// This should never happen, but we do support remote loading
			files!.set(
				name,
				new RemoteFile(import.meta.env.BASE_URL === "/" ? `/${name}` : `${import.meta.env.BASE_URL}/${name}`)
			);
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
				mpqLoaded = e.loaded;
				updateProgress();
			})
		: Promise.resolve<Uint8Array | null>(null);

	[wasm, mpq] = await Promise.all([loadWasm, loadMpq]);

	if (mpq) {
		files!.set(spawn ? "spawn.mpq" : "diabdat.mpq", new Uint8Array(mpq as unknown as ArrayBuffer));
	}

	progress("Initializing...");

	const vers = import.meta.env.VERSION.match(/(\d+)\.(\d+)\.(\d+)/);

	wasm._SNet_InitWebsocket();
	wasm._DApi_Init(
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

worker.addEventListener("message", ({ data }) => {
	switch (data.action) {
		case "init":
			files = data.files;
			init_game(data.mpq, data.spawn, data.offscreen).then(
				() => worker.postMessage({ action: "loaded" }),
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
