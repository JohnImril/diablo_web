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
});
