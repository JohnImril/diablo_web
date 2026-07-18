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

import { loadGame } from "../../modules/engine/adapters";
import { createGameRuntime, isRuntimeSessionCancelledError } from "./gameRuntime";

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
