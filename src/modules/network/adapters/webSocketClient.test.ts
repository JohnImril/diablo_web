import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import websocketOpen from "./webSocketClient";

type Listener = (event: { data?: ArrayBuffer }) => void;

class MockWebSocket {
	static readonly OPEN = 1;
	static instances: MockWebSocket[] = [];
	readonly sent: Uint8Array[] = [];
	readyState = MockWebSocket.OPEN;
	binaryType = "";
	private readonly listeners = new Map<string, Listener[]>();

	constructor(_url: string) {
		MockWebSocket.instances.push(this);
		queueMicrotask(() => this.emit("open"));
		setTimeout(() => this.emit("message", new Uint8Array([0x32, 1, 0, 0, 0]).buffer), 0);
	}

	addEventListener(type: string, listener: Listener) {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: Listener) {
		this.listeners.set(
			type,
			(this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener)
		);
	}

	send(data: Uint8Array) {
		this.sent.push(new Uint8Array(data));
	}

	close() {}

	private emit(type: string, data?: ArrayBuffer) {
		for (const listener of this.listeners.get(type) ?? []) listener({ data });
	}
}

describe("websocket client", () => {
	beforeEach(() => {
		MockWebSocket.instances = [];
		vi.stubGlobal("WebSocket", MockWebSocket);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("flushes queued traffic before sending turn packets immediately", async () => {
		const proxy = websocketOpen("ws://example.test/ws", () => {}, () => {});
		await new Promise((resolve) => setTimeout(resolve, 0));

		const socket = (proxy as unknown as { readyState: number }).readyState;
		expect(socket).toBe(MockWebSocket.OPEN);

		proxy.send(new Uint8Array([0x01, 0xaa]));
		proxy.send(new Uint8Array([0x02, 0xbb]));

		const [instance] = MockWebSocket.instances;
		expect(instance.sent).toEqual([
			new Uint8Array([0x31, 1, 6, 1, 0]),
			new Uint8Array([0x00, 1, 0, 0x01, 0xaa]),
			new Uint8Array([0x02, 0xbb]),
		]);
	});
});
