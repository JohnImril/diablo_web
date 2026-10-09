import type { MainToWorkerMessage, WorkerToMainMessage } from "../core/protocol";
import { isWorkerToMainMessage, PROTOCOL_VERSION } from "../core/protocol";

export type WorkerClientOptions = {
	WorkerCtor: new () => Worker;
};

type MessageHandler = (message: WorkerToMainMessage) => void;
type ErrorHandler = (event: ErrorEvent) => void;

export function createWorkerClient({ WorkerCtor }: WorkerClientOptions) {
	let worker: Worker | null = null;
	let failed = false;
	const messageHandlers = new Set<MessageHandler>();
	const errorHandlers = new Set<ErrorHandler>();
	let requestId = 0;
	const quiesce = (timeoutMs = 30_000) =>
		new Promise<Map<string, Uint8Array>>((resolve, reject) => {
			// The error handler terminates a failed worker, so it cannot produce
			// further writes. Previously delivered writes still need the storage flush.
			if (failed) {
				resolve(new Map());
				return;
			}
			const id = ++requestId;
			const finish = (error?: Error, saves?: Map<string, Uint8Array>) => {
				clearTimeout(timer);
				messageHandlers.delete(onMessage);
				errorHandlers.delete(onError);
				if (error) reject(error);
				else resolve(saves!);
			};
			const onMessage = (message: WorkerToMainMessage) => {
				if (message.action === "quiesced" && message.requestId === id) finish(undefined, message.saves);
			};
			const onError = () => finish(undefined, new Map());
			const timer = setTimeout(
				() => finish(new Error("The engine did not confirm its save snapshot. Reload was blocked.")),
				timeoutMs
			);
			messageHandlers.add(onMessage);
			errorHandlers.add(onError);
			try {
				post({ v: PROTOCOL_VERSION, type: "quiesce", action: "quiesce", requestId: id });
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		});

	const handleMessage = (event: MessageEvent) => {
		const data = event.data;
		if (!isWorkerToMainMessage(data)) {
			console.warn("Worker protocol mismatch, message ignored.", data);
			if (import.meta.env.DEV) {
				throw new Error("Worker protocol mismatch.");
			}
			return;
		}
		for (const handler of messageHandlers) {
			handler(data);
		}
	};

	const handleError = (event: ErrorEvent) => {
		failed = true;
		terminate();
		for (const handler of errorHandlers) {
			handler(event);
		}
	};

	const start = () => {
		if (worker) return worker;
		failed = false;
		worker = new WorkerCtor();
		worker.addEventListener("message", handleMessage);
		worker.addEventListener("error", handleError);
		return worker;
	};

	const post = (message: MainToWorkerMessage, transfer?: Transferable[]) => {
		if (!worker) {
			throw new Error("Worker has not been started.");
		}
		if (transfer?.length) {
			worker.postMessage(message, transfer);
		} else {
			worker.postMessage(message);
		}
	};

	const terminate = () => {
		if (!worker) return;
		worker.removeEventListener("message", handleMessage);
		worker.removeEventListener("error", handleError);
		worker.terminate();
		worker = null;
	};

	const onMessage = (handler: MessageHandler) => {
		messageHandlers.add(handler);
		return () => {
			messageHandlers.delete(handler);
		};
	};

	const onError = (handler: ErrorHandler) => {
		errorHandlers.add(handler);
		return () => {
			errorHandlers.delete(handler);
		};
	};

	return { start, post, terminate, onMessage, onError, quiesce };
}
