import { applyEngineIntent } from "../../modules/engine/core/applyEngineIntent";
import { createWorkerClient, loadGame, SpawnSizes } from "../../modules/engine/adapters";
import type { WorkerToMainMessage, MainToWorkerMessage } from "../../modules/engine/core/protocol";
import { mapInputToEngine, type EngineInputContext } from "../../modules/engine/core/inputMapping";
import type { InputCommand } from "../../modules/input";
import webrtcOpen from "../../modules/network/adapters";
import type { GameFunction, IApi, IFileSystem, IWebRTCConnection } from "../../types";
import { toArrayBuffer } from "../../shared/buffers";
import { createSaveManager, type SaveManagerOptions } from "../../modules/storage/adapters";
import createIndexedDbFs from "../../modules/storage/adapters/indexedDbFs";
import { compressMpq as compressMpqAdapter } from "../../modules/mpqcmp/adapters";
import { createRuntimeEventEmitter, type RuntimeEventMap } from "./runtimeEvents";
import type { LifecycleState } from "./runtimeState";
import { attachFileDrop, createRuntimeInputController, type RuntimeInputOptions } from "./runtimeInput";
import { downloadBlob, revokeBlobUrl } from "./download";
import { createUiApi as createUiApiBridge, type UiApiOptions } from "./uiBridge";

export type GameRuntimeStartOptions = {
	api: IApi;
	file: File | null;
	spawn: boolean;
	storage?: Omit<SaveManagerOptions, "onSavesChanged">;
	reason?: string;
};

export type GameRuntimeState = {
	lifecycle: LifecycleState;
	lastStartOptions?: GameRuntimeStartOptions | null;
};

type RuntimeEventHandler<K extends keyof RuntimeEventMap> = (payload: RuntimeEventMap[K]) => void;
type WorkerStartOptions = {
	WorkerCtor: new () => Worker;
	onMessage?: (message: WorkerToMainMessage) => void;
	onError?: (event: ErrorEvent) => void;
};

type WorkerStartResult = {
	worker: Worker;
	workerClient: ReturnType<typeof createWorkerClient>;
};

export type GameRuntimeInputOptions = Omit<RuntimeInputOptions, "dispatchInput" | "setInputContext" | "getGameHandle">;
export type StartWithFileResult =
	| { status: "importedSave" }
	| { status: "starting"; isRetail: boolean; promise: Promise<GameFunction> };
type StartWithFileOptions = {
	file: File | null;
	apiFactory: (fs: Promise<IFileSystem>) => IApi;
	onBeforeStart?: (info: { isRetail: boolean }) => void;
};

export function createGameRuntime() {
	const events = createRuntimeEventEmitter();
	let state: GameRuntimeState = { lifecycle: "idle" };
	let lastStartOptions: GameRuntimeStartOptions | null = null;
	const cleanupHandlers = new Set<() => void>();
	let workerClient: ReturnType<typeof createWorkerClient> | null = null;
	let worker: Worker | null = null;
	let workerUnsubscribers: Array<() => void> = [];
	let workerCleanupUnsubscribe: (() => void) | null = null;
	let inputCleanupUnsubscribe: (() => void) | null = null;
	let lastInput: InputCommand | null = null;
	let inputContext: EngineInputContext = { isTouchMode: false };
	let gameHandle: GameFunction | null = null;
	let inputController: ReturnType<typeof createRuntimeInputController> | null = null;
	let saveManager: ReturnType<typeof createSaveManager> | null = null;
	let fsPromise: ReturnType<typeof createIndexedDbFs> | null = null;
	let webrtc: IWebRTCConnection | null = null;
	let packetQueue: ArrayBuffer[] = [];
	let networkIntervalId: number | null = null;
	let stopping = false;
	const getGameHandle = () => gameHandle;

	const registerCleanup = (handler: () => void) => {
		cleanupHandlers.add(handler);
		return () => cleanupHandlers.delete(handler);
	};

	const stopWorker = () => {
		if (workerCleanupUnsubscribe) {
			workerCleanupUnsubscribe();
			workerCleanupUnsubscribe = null;
		}
		for (const unsubscribe of workerUnsubscribers) {
			unsubscribe();
		}
		workerUnsubscribers = [];
		workerClient?.terminate();
		workerClient = null;
		worker = null;
	};

	const startWorker = (opts: WorkerStartOptions): WorkerStartResult => {
		stopWorker();
		workerClient = createWorkerClient({ WorkerCtor: opts.WorkerCtor });
		worker = workerClient.start();
		workerUnsubscribers = [];
		if (opts.onMessage) {
			workerUnsubscribers.push(workerClient.onMessage(opts.onMessage));
		}
		if (opts.onError) {
			workerUnsubscribers.push(workerClient.onError(opts.onError));
		}
		if (workerCleanupUnsubscribe) workerCleanupUnsubscribe();
		workerCleanupUnsubscribe = registerCleanup(() => stopWorker());
		return { worker, workerClient };
	};

	const setLifecycle = (next: LifecycleState) => {
		state = { ...state, lifecycle: next };
		events.emit("state", { value: next });
	};

	const start = (opts: GameRuntimeStartOptions): Promise<GameFunction> => {
		lastStartOptions = opts;
		if (state.lifecycle === "running" || state.lifecycle === "loading") return Promise.resolve(gameHandle as GameFunction);
		if (!saveManager) initStorage(opts.storage);
		setLifecycle("loading");
		return loadGame(opts.api, opts.file, opts.spawn, {
			startWorker,
			stopWorker,
			callbacks: {
				onProgress: (payload) => emit("progress", payload),
				onError: (payload) => emit("error", payload),
				onReady: (payload) => emit("ready", payload),
				onExit: (payload) => emit("exit", payload),
				onSaveChanged: (payload) => emit("saveChanged", payload),
			},
			initNetworkBridge,
			handleWorkerPacket,
			handleWorkerPacketBatch,
			stop,
		}).then(
			(loaded) => {
				gameHandle = loaded;
				startInput();
				setLifecycle("running");
				return loaded;
			},
			(error) => {
				setLifecycle("idle");
				return Promise.reject(error);
			}
		);
	};

	const stop = () => {
		if (stopping || state.lifecycle === "exited" || state.lifecycle === "idle") return;
		stopping = true;
		stopInput();
		stopWorker();
		if (networkIntervalId != null) {
			window.clearInterval(networkIntervalId);
			networkIntervalId = null;
		}
		if (webrtc) {
			try {
				webrtc.send(new Uint8Array([0x24]));
			} catch {
				/* empty */
			}
		}
		webrtc = null;
		packetQueue = [];
		try {
			gameHandle?.audio?.stop_all?.();
		} catch {
			/* empty */
		}
		gameHandle = null;
		void notifySavesChanged();
		setLifecycle("idle");
		emit("exit", {});
		stopping = false;
	};

	const dispose = () => {
		for (const handler of Array.from(cleanupHandlers)) {
			try {
				handler();
			} catch {
				/* empty */
			}
		}
		cleanupHandlers.clear();
		lastStartOptions = null;
		setLifecycle("exited");
		events.clear();
	};

	const on = <K extends keyof RuntimeEventMap>(event: K, handler: RuntimeEventHandler<K>) => events.on(event, handler);
	const emit = <K extends keyof RuntimeEventMap>(event: K, payload: RuntimeEventMap[K]) => events.emit(event, payload);
	const subscribe = <K extends keyof RuntimeEventMap>(event: K, handler: RuntimeEventHandler<K>) => {
		const unsubscribe = on(event, handler);
		registerCleanup(unsubscribe);
		return unsubscribe;
	};

	const getState = (): GameRuntimeState => ({
		...state,
		lastStartOptions,
	});

	const dispatchInput = (command: InputCommand) => {
		lastInput = command;
		if (
			(command.type === "MouseMove" || command.type === "MouseDown" || command.type === "MouseUp") &&
			gameHandle
		) {
			const intent = mapInputToEngine(command, inputContext);
			applyEngineIntent(gameHandle, intent);
			return;
		}
		if ((command.type === "KeyDown" || command.type === "KeyUp") && gameHandle) {
			const intent = mapInputToEngine(command, inputContext);
			applyEngineIntent(gameHandle, intent);
			return;
		}
		if (import.meta.env.DEV) {
			void lastInput;
		}
	};

	const setInputContext = (next: Partial<EngineInputContext>) => {
		inputContext = { ...inputContext, ...next };
	};

	const initInput = (opts: GameRuntimeInputOptions) => {
		if (inputController) return inputController;
		inputController = createRuntimeInputController({
			...opts,
			dispatchInput,
			setInputContext,
			getGameHandle: () => gameHandle,
		});
		if (inputCleanupUnsubscribe) inputCleanupUnsubscribe();
		inputCleanupUnsubscribe = registerCleanup(() => {
			inputController?.dispose();
			inputController = null;
		});
		return inputController;
	};

	const startInput = () => inputController?.start();
	const stopInput = () => inputController?.stop();
	const handleKeyboardInput = (blur: boolean) => {
		inputController?.handleKeyboardInput(blur);
	};

	const initStorage = (opts?: Omit<SaveManagerOptions, "onSavesChanged">) => {
		if (!fsPromise) {
			fsPromise = (opts?.fs ?? createIndexedDbFs()) as ReturnType<typeof createIndexedDbFs>;
		}
		if (saveManager) return saveManager;
		saveManager = createSaveManager({
			...(opts ?? { fs: fsPromise }),
			fs: fsPromise,
			onSavesChanged: (names) => {
				emit("savesChanged", { names });
			},
		});
		return saveManager;
	};

	const getFileSystem = () => fsPromise;
	const getSaveUrl = async (name: string) => {
		if (!fsPromise) return undefined;
		const fsInstance = await fsPromise;
		return fsInstance.fileUrl(name);
	};
	const getSpawnAvailability = async () => {
		if (!fsPromise) fsPromise = createIndexedDbFs();
		const fsInstance = await fsPromise;
		const spawn = fsInstance.files.get("spawn.mpq");
		return !!(spawn && SpawnSizes.includes(spawn.byteLength));
	};
	const compressMpq = (file: File, progress: (text: string, loaded?: number, total?: number) => void) =>
		compressMpqAdapter(file, progress);

	const getSaves = () => saveManager?.listSaves();
	const deleteSave = (name: string) => saveManager?.deleteSave(name);
	const downloadSave = (name: string) => saveManager?.downloadSave(name);
	const importSave = (file: File) => saveManager?.importSave(file);
	const notifySavesChanged = async () => {
		if (!saveManager) return;
		const saves = await saveManager.listSaves();
		emit("savesChanged", { names: Object.keys(saves) });
	};

	const ensureStorageReady = async () => {
		initStorage();
		const fs = getFileSystem();
		const hasSpawn = await getSpawnAvailability();
		await notifySavesChanged();
		return { fs, hasSpawn };
	};

	const startWithFile = ({ file, apiFactory, onBeforeStart }: StartWithFileOptions): StartWithFileResult => {
		if (file && /\.sv$/i.test(file.name)) {
			importSave(file);
			return { status: "importedSave" };
		}

		if (!getFileSystem()) initStorage();
		const fs = getFileSystem() as ReturnType<typeof createIndexedDbFs>;

		const isRetail = !!(file && !/^spawn\.mpq$/i.test(file.name));
		onBeforeStart?.({ isRetail });

		const promise = start({
			api: apiFactory(fs),
			file,
			spawn: !isRetail,
		});

		return { status: "starting", isRetail, promise };
	};

	type UiSubscriptions = {
		onProgress?: (payload: RuntimeEventMap["progress"]) => void;
		onError?: (payload: RuntimeEventMap["error"]) => void;
		onSaveChanged?: (payload: RuntimeEventMap["saveChanged"]) => void;
		onExit?: (payload: RuntimeEventMap["exit"]) => void;
		onReady?: (payload: RuntimeEventMap["ready"]) => void;
		onSavesChanged?: (payload: RuntimeEventMap["savesChanged"]) => void;
		onState?: (payload: RuntimeEventMap["state"]) => void;
	};

	const subscribeUI = (handlers: UiSubscriptions) => {
		const unsubscribers: Array<() => void> = [];
		if (handlers.onProgress) unsubscribers.push(subscribe("progress", handlers.onProgress));
		if (handlers.onError) unsubscribers.push(subscribe("error", handlers.onError));
		if (handlers.onSaveChanged) unsubscribers.push(subscribe("saveChanged", handlers.onSaveChanged));
		if (handlers.onExit) unsubscribers.push(subscribe("exit", handlers.onExit));
		if (handlers.onReady) unsubscribers.push(subscribe("ready", handlers.onReady));
		if (handlers.onSavesChanged) unsubscribers.push(subscribe("savesChanged", handlers.onSavesChanged));
		if (handlers.onState) unsubscribers.push(subscribe("state", handlers.onState));
		return () => {
			for (const unsub of unsubscribers) {
				unsub();
			}
		};
	};

	const createUiApi = (opts: UiApiOptions): IApi => {
		return createUiApiBridge({ ...opts, getGameHandle });
	};

	const initNetworkBridge = (opts: {
		workerClient: ReturnType<typeof createWorkerClient>;
		toWorkerMessage: (message: unknown) => MainToWorkerMessage;
	}) => {
		packetQueue = [];
		webrtc = webrtcOpen((data) => {
			const buffer = toArrayBuffer(data);
			emit("netPacket", { data: buffer });
			packetQueue.push(buffer);
			if (packetQueue.length > 100) packetQueue.shift();
		});
		if (networkIntervalId != null) window.clearInterval(networkIntervalId);
		networkIntervalId = window.setInterval(() => {
			if (packetQueue.length) {
				const batch = packetQueue.slice();
				opts.workerClient.post(opts.toWorkerMessage({ action: "packetBatch", batch }));
				packetQueue.length = 0;
			}
		}, 20);
		return { webrtc, intervalId: networkIntervalId };
	};

	const handleWorkerPacket = (buffer: ArrayBuffer | Uint8Array) => {
		try {
			webrtc?.send(buffer);
		} catch (error) {
			emit("netError", {
				message: error instanceof Error ? error.message : "WebRTC send failed",
				stack: error instanceof Error ? error.stack : undefined,
			});
		}
	};

	const handleWorkerPacketBatch = (batch: ArrayBuffer[] | Uint8Array[]) => {
		const payload = batch.map((packet) => toArrayBuffer(packet));
		emit("netBatch", { data: payload });
		for (const packet of batch) {
			try {
				webrtc?.send(packet);
			} catch (error) {
				emit("netError", {
					message: error instanceof Error ? error.message : "WebRTC send failed",
					stack: error instanceof Error ? error.stack : undefined,
				});
			}
		}
	};

	return {
		start,
		stop,
		dispose,
		on,
		emit,
		subscribe,
		registerCleanup,
		getState,
		initInput,
		startInput,
		stopInput,
		handleKeyboardInput,
		dispatchInput,
		initStorage,
		getFileSystem,
		getSaveUrl,
		getSpawnAvailability,
		compressMpq,
		getSaves,
		deleteSave,
		downloadSave,
		importSave,
		notifySavesChanged,
		ensureStorageReady,
		startWithFile,
		subscribeUI,
		initNetworkBridge,
		handleWorkerPacket,
		handleWorkerPacketBatch,
		downloadBlob,
		revokeBlobUrl,
		attachFileDrop,
		createUiApi,
	};
}
