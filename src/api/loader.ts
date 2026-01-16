import Worker from "./game.worker.js?worker";
import init_sound from "./sound";
import load_spawn from "./load_spawn";
import webrtc_open from "./webrtc";
import type { GameFunction, IApi, IAudioApi, IWebRTCConnection } from "../types";
import { toArrayBuffer } from "../utils/buffers";

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

async function do_load_game(api: IApi, audio: IAudioApi, mpq: File | null, spawn: boolean): Promise<GameFunction> {
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
			const worker = new Worker();

			const gameFn: GameFunction = Object.assign(
				(func: string, ...params: (string | number)[]) => worker.postMessage({ action: "event", func, params }),
				{
					worker,
					webrtc: null as IWebRTCConnection | null,
					webrtcIntervalId: null as number | null,
					audio,
				}
			);

			const packetQueue: ArrayBuffer[] = [];
			const webrtc: IWebRTCConnection = webrtc_open((data) => {
				packetQueue.push(toArrayBuffer(data));
				if (packetQueue.length > 100) packetQueue.shift();
			});

			gameFn.webrtc = webrtc;

			let intervalId: number | null = null;
			let resolved = false;

			worker.addEventListener("message", ({ data }) => {
				switch (data.action) {
					case "loaded": {
						if (!resolved) {
							resolved = true;
							intervalId = window.setInterval(() => {
								if (packetQueue.length) {
									worker.postMessage({ action: "packetBatch", batch: packetQueue });
									packetQueue.length = 0;
								}
							}, 20);

							gameFn.webrtcIntervalId = intervalId;
							resolve(gameFn);
						}
						break;
					}

					case "render":
						onRender(api, context, data.batch);
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
						api.onError(data.error, data.stack);
						break;

					case "failed":
						reject({ message: data.error, stack: data.stack });
						break;

					case "progress":
						api.onProgress({ text: data.text, loaded: data.loaded, total: data.total });
						break;

					case "exit":
						audio.stop_all();
						api.onExit();
						break;

					case "current_save":
						api.setCurrentSave(data.name);
						break;

					case "packet":
						webrtc.send(data.buffer);
						break;

					case "packetBatch":
						for (const packet of data.batch) {
							webrtc.send(packet);
						}
						break;

					default:
				}
			});

			const workerFiles = new Map<string, Uint8Array>();
			const transfer: ArrayBuffer[] = [];
			for (const [name, file] of fs.files) {
				const copy = file.slice();
				workerFiles.set(name, copy);
				transfer.push(toArrayBuffer(copy.buffer));
			}

			worker.postMessage({ action: "init", files: workerFiles, mpq, spawn, offscreen }, transfer);
		} catch (error) {
			reject(error);
		}
	});
}

export default function load_game(api: IApi, mpq: File | null, spawn: boolean): Promise<GameFunction> {
	const audio = init_sound();
	return do_load_game(api, audio, mpq, spawn);
}
