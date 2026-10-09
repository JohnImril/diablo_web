import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameFunction, IApi, IFileSystem } from "../../types";

vi.mock("../../modules/engine/adapters", () => ({
	createWorkerClient: vi.fn(),
	loadGame: vi.fn(),
	SpawnSizes: [],
}));
vi.mock("../../modules/network/adapters", () => ({ default: vi.fn() }));
vi.mock("../../modules/storage/adapters", () => ({
	createSaveManager: vi.fn(() => ({ listSaveNames: vi.fn(async () => []) })),
}));
vi.mock("../../modules/storage/adapters/indexedDbFs", () => ({ default: vi.fn() }));

import { createWorkerClient, loadGame } from "../../modules/engine/adapters";
import { createGameRuntime, isRuntimeSessionCancelledError } from "./gameRuntime";
import { pendingStorageWrites } from "../../modules/storage/core/pendingWrites";

const createDeferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
};

const createGameHandle = (): GameFunction => Object.assign(() => undefined, {});
const startOptions = {
	api: {} as IApi,
	file: null,
	spawn: true,
	storage: { fs: Promise.resolve({} as IFileSystem) },
};

describe("game runtime sessions", () => {
	beforeEach(() => {
		vi.mocked(loadGame).mockReset();
	});
	it("waits for the worker barrier and pending writes without replaying stale saves", async () => {
		const snapshot = createDeferred<Map<string, Uint8Array>>();
		const persisted = createDeferred<void>();
		const terminate = vi.fn();
		const fs = {
			files: new Map<string, Uint8Array>(),
			update: vi.fn(),
		} as unknown as IFileSystem;
		vi.mocked(createWorkerClient).mockReturnValue({
			start: () => ({}) as Worker,
			terminate,
			quiesce: () => snapshot.promise,
		} as unknown as ReturnType<typeof createWorkerClient>);
		vi.mocked(loadGame).mockImplementation((_api, _file, _spawn, bridge) => {
			bridge!.startWorker({ WorkerCtor: class {} as unknown as new () => Worker });
			return Promise.resolve(createGameHandle());
		});
		const runtime = createGameRuntime();
		await runtime.start({ ...startOptions, storage: { fs: Promise.resolve(fs) } });
		const preparing = runtime.prepareForUpdate();
		expect(terminate).not.toHaveBeenCalled();
		// Simulate a file operation received before the worker's barrier reply.
		pendingStorageWrites.track(persisted.promise);
		const data = new Uint8Array([7, 8, 9]);
		snapshot.resolve(new Map([["single_0.sv", data], ["single_1.sv", data]]));
		await Promise.resolve();
		expect(terminate).not.toHaveBeenCalled();
		persisted.resolve();
		await preparing;
		// Another tab may have updated single_0 or deleted single_1 in IndexedDB.
		expect(fs.update).not.toHaveBeenCalled();
		expect(terminate).toHaveBeenCalledOnce();
	});
	it("cancels loading before an update if the worker has not started yet", async () => {
		const engine = createDeferred<GameFunction>();
		vi.mocked(loadGame).mockReturnValue(engine.promise);
		const runtime = createGameRuntime();
		const started = runtime.start(startOptions);
		const cancelled = expect(started).rejects.toSatisfy(isRuntimeSessionCancelledError);
		await runtime.prepareForUpdate();
		await cancelled;
		engine.resolve(createGameHandle());
		await Promise.resolve();
		expect(runtime.getState().lifecycle).toBe("idle");
	});

	it("ignores a late completion from a stopped session", async () => {
		const first = createDeferred<GameFunction>();
		const second = createDeferred<GameFunction>();
		vi.mocked(loadGame).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const runtime = createGameRuntime();

		const firstStart = runtime.start(startOptions);
		runtime.stop();
		await expect(firstStart).rejects.toSatisfy(isRuntimeSessionCancelledError);

		const secondStart = runtime.start(startOptions);
		first.resolve(createGameHandle());
		await Promise.resolve();
		expect(runtime.getState().lifecycle).toBe("loading");

		second.resolve(createGameHandle());
		await expect(secondStart).resolves.toBeTypeOf("function");
		expect(runtime.getState().lifecycle).toBe("running");
	});
});
