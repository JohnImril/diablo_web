import Worker from "./game.worker.js?worker";
import init_sound from "./sound";
import load_spawn from "./spawnLoader";
import { PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage } from "../core/protocol";
import { createWorkerClient } from "./workerClient";
import type { GameFunction, IApi, IAudioApi, IWebRTCConnection } from "types";
import { toArrayBuffer } from "shared/buffers";

interface IRenderBatch {
	bitmap?: ImageBitmap;
	images: { x: number; y: number; w: number; h: number; data: Uint8ClampedArray }[];
	text: { x: number; y: number; text: string; color: number }[];
	clip?: { x0: number; y0: number; x1: number; y1: number };
	belt: number[];
}

function onRender(api: IApi, ctx: CanvasRenderingContext2D | ImageBitmapRenderingContext | null, batch: IRenderBatch) {
	if (batch.bitmap) {
		(ctx as ImageBitmapRenderingContext).transferFromImageBitmap(batch.bitmap);
	} else if (ctx instanceof CanvasRenderingContext2D) {
		for (const { x, y, w, h, data } of batch.images) {
			const image = ctx.createImageData(w, h);
			image.data.set(data);
			ctx.putImageData(image, x, y);
		}
		if (batch.text.length) {
			ctx.save();
			ctx.font = "bold 13px Times New Roman";
			if (batch.clip) {
				const { x0, y0, x1, y1 } = batch.clip;
				ctx.beginPath();
				ctx.rect(x0, y0, x1 - x0, y1 - y0);
				ctx.clip();
			}
			for (const { x, y, text: str, color } of batch.text) {
				ctx.fillStyle = `rgb(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff})`;
				ctx.fillText(str, x, y + 22);
			}
			ctx.restore();
		}
	}

	api.updateBelt(batch.belt);
}

function testOffscreen() {
	return false;
	// This works but I couldn't see any performance difference, and support for 2D canvas in workers is very poor.
	// In this mode, instead of sending a batch of areas to draw back to the main thread, the worker does all drawing on its own and sends a complete bitmap object back.
	// However, this effectively clears the worker's canvas, so we need to redraw the whole frame every time, which defeats the performance gained from reduced copying.
	/*try {
    const canvas = document.createElement("canvas");
    const offscreen = canvas.transferControlToOffscreen();
    const context = offscreen.getContext("2d");
    return context != null;
  } catch (e) {
    return false;
  }*/
}

type EngineLoadCallbacks = {
	onProgress?: (payload: { text: string; loaded: number; total?: number }) => void;
	onError?: (payload: { message: string; stack?: string }) => void;
	onReady?: (payload: { startedAt: number }) => void;
	onExit?: (payload: { reason?: string }) => void;
	onSaveChanged?: (payload: { name: string | null }) => void;
};

export type EngineRuntimeBridge = {
	stop?: () => void;
	startWorker: (opts: { WorkerCtor: new () => Worker }) => {
		worker: Worker;
		workerClient: ReturnType<typeof createWorkerClient>;
	};
	stopWorker: () => void;
	callbacks?: EngineLoadCallbacks;
	initNetworkBridge?: (opts: {
		workerClient: ReturnType<typeof createWorkerClient>;
		toWorkerMessage: (message: unknown) => MainToWorkerMessage;
	}) => { webrtc: IWebRTCConnection; intervalId: number | null };
	handleWorkerPacket?: (buffer: ArrayBuffer | Uint8Array) => void;
	handleWorkerPacketBatch?: (batch: ArrayBuffer[] | Uint8Array[]) => void;
};

async function do_load_game(
	api: IApi,
	audio: IAudioApi,
	mpq: File | null,
	spawn: boolean,
	runtime?: EngineRuntimeBridge
): Promise<GameFunction> {
	const fs = await api.fs;
	if (spawn && !mpq) {
		await load_spawn(api, fs);
	}

	let context: CanvasRenderingContext2D | ImageBitmapRenderingContext | null = null;
	let offscreen = false;
	if (testOffscreen()) {
		context = api.canvas.getContext("bitmaprenderer");
		offscreen = true;
	} else {
		context = api.canvas.getContext("2d", { alpha: false });
	}

	return await new Promise<GameFunction>((resolve, reject) => {
		try {
			const runtimeWorker = runtime?.startWorker({ WorkerCtor: Worker });

			const workerClient = runtimeWorker?.workerClient ?? createWorkerClient({ WorkerCtor: Worker });
			const worker = runtimeWorker?.worker ?? workerClient.start();

			type MainToWorkerPayload = Omit<MainToWorkerMessage, "v" | "type">;
			type MainToWorkerInit = Extract<MainToWorkerMessage, { action: "init" }>;
			type MainToWorkerEvent = Extract<MainToWorkerMessage, { action: "event" }>;
			type MainToWorkerPacket = Extract<MainToWorkerMessage, { action: "packet" }>;
			type MainToWorkerPacketBatch = Extract<MainToWorkerMessage, { action: "packetBatch" }>;

			function toWorkerMessage(message: Omit<MainToWorkerInit, "v" | "type">): MainToWorkerInit;
			function toWorkerMessage(message: Omit<MainToWorkerEvent, "v" | "type">): MainToWorkerEvent;
			function toWorkerMessage(message: Omit<MainToWorkerPacket, "v" | "type">): MainToWorkerPacket;
			function toWorkerMessage(message: Omit<MainToWorkerPacketBatch, "v" | "type">): MainToWorkerPacketBatch;
			function toWorkerMessage(message: MainToWorkerPayload): MainToWorkerMessage {
				return {
					...message,
					v: PROTOCOL_VERSION,
					type: message.action,
				} as MainToWorkerMessage;
			}

			const gameFn: GameFunction = Object.assign(
				(func: string, ...params: (string | number)[]) =>
					workerClient.post(toWorkerMessage({ action: "event", func, params })),
				{
					worker,
					webrtc: null as IWebRTCConnection | null,
					webrtcIntervalId: null as number | null,
					audio,
				}
			);

			let intervalId: number | null = null;
			let webrtc: IWebRTCConnection | null = null;

			if (runtime?.initNetworkBridge) {
				const bridge = runtime.initNetworkBridge({
					workerClient,
					toWorkerMessage: toWorkerMessage as (message: unknown) => MainToWorkerMessage,
				});
				webrtc = bridge.webrtc;
				intervalId = bridge.intervalId;
				gameFn.webrtc = webrtc;
			}
			let resolved = false;

			const emitProgress = (payload: { text: string; loaded: number; total?: number }) => {
				if (runtime?.callbacks?.onProgress) {
					runtime.callbacks.onProgress(payload);
				} else {
					api.onProgress({
						text: payload.text,
						loaded: payload.loaded,
						total: payload.total as number,
					});
				}
			};

			const emitError = (payload: { message: string; stack?: string }) => {
				if (runtime?.callbacks?.onError) {
					runtime.callbacks.onError(payload);
				} else {
					api.onError(payload.message, payload.stack);
				}
			};

			const emitSaveChanged = (payload: { name: string | null }) => {
				if (runtime?.callbacks?.onSaveChanged) {
					runtime.callbacks.onSaveChanged(payload);
				} else {
					api.setCurrentSave(payload.name as string);
				}
			};

			const emitExit = (payload: { reason?: string }) => {
				if (runtime?.callbacks?.onExit) {
					runtime.callbacks.onExit(payload);
				} else {
					api.onExit();
				}
			};

			const emitReady = (payload: { startedAt: number }) => {
				if (runtime?.callbacks?.onReady) {
					runtime.callbacks.onReady(payload);
				}
			};

			const handleMessage = (data: WorkerToMainMessage) => {
				switch (data.action) {
					case "loaded": {
						if (!resolved) {
							resolved = true;
							gameFn.webrtcIntervalId = intervalId;
							emitReady({ startedAt: Date.now() });
							resolve(gameFn);
						}
						break;
					}

					case "render":
						onRender(api, context, data.batch as IRenderBatch);
						break;

					case "audio":
						(audio[data.func as keyof IAudioApi] as (...args: unknown[]) => void)(...data.params);
						break;

					case "audioBatch":
						for (const { func, params } of data.batch as { func: keyof IAudioApi; params: unknown[] }[]) {
							(audio[func] as (...args: unknown[]) => void)(...params);
						}
						break;

					case "fs":
						(fs as unknown as Record<string, (...args: unknown[]) => void>)[data.func](...data.params);
						break;

					case "cursor":
						api.setCursorPos(data.x, data.y);
						break;

					case "keyboard":
						api.openKeyboard(data.rect);
						break;

					case "error":
						audio.stop_all();
						emitError({ message: data.error, stack: data.stack });
						break;

					case "failed":
						reject({ message: data.error, stack: data.stack });
						break;

					case "progress":
						emitProgress({ text: data.text, loaded: data.loaded, total: data.total as number });
						break;

					case "exit":
						audio.stop_all();
						if (runtime?.stop) {
							runtime.stop();
						} else {
							emitExit({});
						}
						break;

					case "current_save":
						emitSaveChanged({ name: data.name as string | null });
						break;

					case "packet":
						if (runtime?.handleWorkerPacket) {
							runtime.handleWorkerPacket(data.buffer);
						} else {
							webrtc?.send(data.buffer);
						}
						break;

					case "packetBatch":
						if (runtime?.handleWorkerPacketBatch) {
							runtime.handleWorkerPacketBatch(data.batch);
						} else {
							for (const packet of data.batch) {
								webrtc?.send(packet);
							}
						}
						break;

					default:
				}
			};

			const handleError = (event: ErrorEvent) => {
				void event;
			};

			workerClient.onMessage(handleMessage);
			workerClient.onError(handleError);

			const workerFiles = new Map<string, Uint8Array>();
			const transfer: ArrayBuffer[] = [];
			for (const [name, file] of fs.files) {
				const copy = file.slice();
				workerFiles.set(name, copy);
				transfer.push(toArrayBuffer(copy.buffer));
			}

			workerClient.post(toWorkerMessage({ action: "init", files: workerFiles, mpq, spawn, offscreen }), transfer);
		} catch (error) {
			reject(error);
		}
	});
}

export default function load_game(
	api: IApi,
	mpq: File | null,
	spawn: boolean,
	runtime?: EngineRuntimeBridge
): Promise<GameFunction> {
	const audio = init_sound();
	return do_load_game(api, audio, mpq, spawn, runtime);
}
