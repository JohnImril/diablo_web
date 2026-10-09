import { afterEach, describe, expect, it, vi } from "vitest";
import type { MainToWorkerMessage } from "../core/protocol";
import { createWorkerClient } from "./workerClient";

class FakeWorker extends EventTarget {
	postMessage = vi.fn<(message: MainToWorkerMessage) => void>();
	terminate = vi.fn();
}
afterEach(() => vi.useRealTimers());
describe("engine update barrier", () => {
	it.each([false, true])("permits the storage flush after a worker error (barrier pending: %s)", async (pending) => {
		const client = createWorkerClient({ WorkerCtor: FakeWorker as unknown as new () => Worker });
		const worker = client.start() as unknown as FakeWorker;
		const onError = vi.fn();
		client.onError(onError);
		const preparing = pending ? client.quiesce() : undefined;
		worker.dispatchEvent(new Event("error"));
		await expect(preparing ?? client.quiesce()).resolves.toEqual(new Map());
		expect(worker.terminate).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledOnce();
		// Restarting the client must require a barrier from the new worker.
		const next = client.start() as unknown as FakeWorker;
		const barrier = client.quiesce();
		expect(next.postMessage).toHaveBeenCalledOnce();
		next.dispatchEvent(new Event("error"));
		await barrier;
	});
	it("waits for the matching snapshot before allowing termination", async () => {
		const client = createWorkerClient({ WorkerCtor: FakeWorker as unknown as new () => Worker });
		const worker = client.start() as unknown as FakeWorker;
		const saves = new Map([["single_0.sv", new Uint8Array([1, 2])]]);
		const done = vi.fn();
		const preparing = client.quiesce().then(done);
		const request = worker.postMessage.mock.calls[0][0];
		if (request.action !== "quiesce") throw new Error("Expected quiesce request");
		const { requestId } = request;
		worker.dispatchEvent(
			new MessageEvent("message", {
				data: {
					v: 1,
					type: "quiesced",
					action: "quiesced",
					requestId: requestId + 1,
					saves,
				},
			})
		);
		await Promise.resolve();
		expect(done).not.toHaveBeenCalled();
		expect(worker.terminate).not.toHaveBeenCalled();
		worker.dispatchEvent(
			new MessageEvent("message", {
				data: {
					v: 1,
					type: "quiesced",
					action: "quiesced",
					requestId,
					saves,
				},
			})
		);
		await preparing;
		expect(done).toHaveBeenCalledWith(saves);
		client.terminate();
		expect(worker.terminate).toHaveBeenCalledOnce();
	});
	it("blocks an update if the worker cannot confirm its saves", async () => {
		vi.useFakeTimers();
		const client = createWorkerClient({ WorkerCtor: FakeWorker as unknown as new () => Worker });
		const worker = client.start() as unknown as FakeWorker;
		const result = expect(client.quiesce(100)).rejects.toThrow("Reload was blocked");
		await vi.advanceTimersByTimeAsync(100);
		await result;
		expect(worker.terminate).not.toHaveBeenCalled();
	});
});
