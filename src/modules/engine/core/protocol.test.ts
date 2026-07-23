import { describe, expect, it } from "vitest";

import { isMainToWorkerMessage, isWorkerToMainMessage, PROTOCOL_VERSION } from "./protocol";

const envelope = <T extends string>(action: T) => ({ v: PROTOCOL_VERSION, type: action, action });

describe("engine worker protocol guards", () => {
	it("accepts valid messages", () => {
		expect(isMainToWorkerMessage({ ...envelope("event"), func: "tick", params: [1, "value"] })).toBe(true);
		expect(isWorkerToMainMessage({ ...envelope("progress"), text: "Loading", loaded: 1, total: 2 })).toBe(true);
		expect(
			isWorkerToMainMessage({
				...envelope("progress"),
				text: "Initializing...",
				loaded: undefined,
				total: undefined,
			})
		).toBe(true);
	});

	it("rejects incompatible or inconsistent envelopes", () => {
		expect(isWorkerToMainMessage({ ...envelope("loaded"), v: PROTOCOL_VERSION + 1 })).toBe(false);
		expect(isWorkerToMainMessage({ ...envelope("loaded"), action: "exit" })).toBe(false);
	});

	it("accepts every main-to-worker payload emitted by the runtime", () => {
		const packet = new ArrayBuffer(4);
		const messages = [
			{ ...envelope("init"), files: new Map<string, Uint8Array>(), mpq: null, spawn: true, offscreen: false },
			{ ...envelope("event"), func: "DApi_Render", params: [1, "value"] },
			{ ...envelope("packet"), buffer: new Uint8Array(4) },
			{ ...envelope("packetBatch"), batch: [packet] },
		];

		for (const message of messages) {
			expect(isMainToWorkerMessage(message), message.action).toBe(true);
		}
	});

	it("accepts every non-render worker payload emitted by the WASM adapter", () => {
		const packet = new ArrayBuffer(4);
		const messages = [
			envelope("loaded"),
			envelope("exit"),
			{ ...envelope("current_save"), name: "single_0.sv" },
			{ ...envelope("current_save"), name: null },
			{ ...envelope("fs"), func: "update", params: ["single_0.sv", new Uint8Array(4)] },
			{ ...envelope("fs"), func: "delete", params: ["single_0.sv"] },
			{ ...envelope("cursor"), x: 10, y: 20 },
			{ ...envelope("keyboard"), rect: [0, 0, 640, 480, 16] },
			{ ...envelope("keyboard"), rect: null },
			{ ...envelope("audio"), func: "create_sound_raw", params: [1, new Float32Array(4), 4, 1, 22050] },
			{ ...envelope("audioBatch"), batch: [{ func: "play_sound", params: [1, 100, 0, 0] }] },
			{ ...envelope("packet"), buffer: new Uint8Array(4) },
			{ ...envelope("packetBatch"), batch: [packet] },
			{ ...envelope("error"), error: "failure", stack: "stack" },
			{ ...envelope("failed"), error: "failure" },
		];

		for (const message of messages) {
			expect(isWorkerToMainMessage(message), message.action).toBe(true);
		}
	});

	it("rejects malformed render buffers", () => {
		const render = {
			...envelope("render"),
			batch: {
				belt: new Uint8Array(),
				images: [{ x: 0, y: 0, w: 2, h: 2, data: new Uint8Array(15) }],
				text: [],
			},
		};

		expect(isWorkerToMainMessage(render)).toBe(false);
		render.batch.images[0].data = new Uint8Array(16);
		expect(isWorkerToMainMessage(render)).toBe(true);
	});

	it("accepts render batches without a belt update", () => {
		expect(
			isWorkerToMainMessage({
				...envelope("render"),
				batch: {
					belt: null,
					images: [],
					text: [],
					clip: null,
				},
			})
		).toBe(true);
	});

	it("accepts the signed belt buffer produced by HEAP32", () => {
		expect(
			isWorkerToMainMessage({
				...envelope("render"),
				batch: {
					belt: new Int32Array([3, 3, -1, -1, -1, -1, -1, -1]),
					images: [
						{
							x: 0,
							y: 0,
							w: 640,
							h: 480,
							data: new Uint8Array(640 * 480 * 4),
						},
					],
					text: [],
					clip: null,
				},
			})
		).toBe(true);
	});
});
