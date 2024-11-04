import Worker from "./game.worker.js?worker";
import init_sound from "./sound";
import load_spawn from "./load_spawn";
import load_diabdat from "./load_diabdat";
import webrtc_open from "./webrtc";
import { IApi } from "../types";

interface IRenderBatch {
	bitmap?: ImageBitmap;
	images: { x: number; y: number; w: number; h: number; data: Uint8ClampedArray }[];
	text: { x: number; y: number; text: string; color: number }[];
	clip?: { x0: number; y0: number; x1: number; y1: number };
	belt: number[];
}

interface IAudioApi {
	[func: string]: (...params: any) => void;
}

function onRender(api: IApi, ctx: CanvasRenderingContext2D | ImageBitmapRenderingContext, batch: IRenderBatch) {
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

async function do_load_game(api: IApi, audio: IAudioApi, mpq: File | null, spawn: boolean) {
	const fs = await api.fs;
	if (spawn && !mpq) {
		await load_spawn(api, fs);
	} else {
		await load_diabdat(api, fs);
	}

	let context: CanvasRenderingContext2D | ImageBitmapRenderingContext | null = null;
	let offscreen = false;
	if (testOffscreen()) {
		context = api.canvas.getContext("bitmaprenderer");
		offscreen = true;
	} else {
		context = api.canvas.getContext("2d", { alpha: false });
	}

	return await new Promise((resolve, reject) => {
		try {
			const worker = new Worker();
			const packetQueue: ArrayBuffer[] = [];
			const webrtc = webrtc_open((data: ArrayBuffer) => packetQueue.push(data));

			worker.addEventListener("message", ({ data }) => {
				switch (data.action) {
					case "loaded":
						resolve((func: string, ...params: unknown[]) =>
							worker.postMessage({ action: "event", func, params })
						);
						break;
					case "render":
						onRender(api, context!, data.batch);
						break;
					case "audio":
						audio[data.func](...data.params);
						break;
					case "audioBatch":
						for (const { func, params } of data.batch) {
							audio[func](...params);
						}
						break;
					case "fs":
						(fs as any)[data.func](...data.params);
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

			const transfer: ArrayBuffer[] = [];
			for (const [, file] of fs.files) {
				transfer.push(file.buffer);
			}
			worker.postMessage({ action: "init", files: fs.files, mpq, spawn, offscreen }, transfer);
			setInterval(() => {
				if (packetQueue.length) {
					worker.postMessage({ action: "packetBatch", batch: packetQueue }, packetQueue);
					packetQueue.length = 0;
				}
			}, 20);
			fs.files.clear();
		} catch (error) {
			reject(error);
		}
	});
}

export default function load_game(api: IApi, mpq: File | null, spawn: boolean) {
	const audio = init_sound();
	return do_load_game(api, audio, mpq, spawn);
}
