import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveWsUrl, openSocket, closeSocket } = vi.hoisted(() => ({
	resolveWsUrl: vi.fn<() => string>(),
	openSocket: vi.fn(),
	closeSocket: vi.fn(),
}));

vi.mock("shared/wsUrl", () => ({ resolveWsUrl }));
vi.mock("../../network/adapters/webSocketClient", () => ({ default: openSocket }));
vi.mock("./diablo.jscc", () => ({ default: vi.fn() }));
vi.mock("./diabloSpawn.jscc", () => ({ default: vi.fn() }));

const createWorkerScope = () => ({
	DApi: undefined as { use_websocket: (enabled: boolean) => void } | undefined,
	addEventListener: vi.fn(),
	postMessage: vi.fn(),
});

describe("optional WebSocket configuration in the engine worker", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.resetAllMocks();
		openSocket.mockReturnValue({ readyState: 1, close: closeSocket });
	});

	afterEach(() => vi.unstubAllGlobals());

	it("loads and allows non-WebSocket play without an endpoint", async () => {
		resolveWsUrl.mockImplementation(() => {
			throw new Error("Missing multiplayer endpoint");
		});
		const worker = createWorkerScope();
		vi.stubGlobal("self", worker);

		await import("./game.worker");
		expect(worker.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));
		expect(() => worker.DApi!.use_websocket(false)).not.toThrow();
		expect(resolveWsUrl).not.toHaveBeenCalled();
		expect(openSocket).not.toHaveBeenCalled();

		expect(() => worker.DApi!.use_websocket(true)).toThrow("Missing multiplayer endpoint");
		expect(openSocket).not.toHaveBeenCalled();
	});

	it("uses the configured endpoint when WebSocket play is selected and closes on exit", async () => {
		resolveWsUrl.mockReturnValue("wss://example.org/ws");
		const worker = createWorkerScope();
		vi.stubGlobal("self", worker);
		await import("./game.worker");

		worker.DApi!.use_websocket(true);
		expect(openSocket).toHaveBeenCalledWith("wss://example.org/ws", expect.any(Function), expect.any(Function));
		worker.DApi!.use_websocket(false);
		expect(closeSocket).toHaveBeenCalledOnce();
	});
});
