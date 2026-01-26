import type { MainToWorkerMessage, WorkerToMainMessage } from "../core/protocol";
import { isWorkerToMainMessage } from "../core/protocol";

export type WorkerClientOptions = {
	WorkerCtor: new () => Worker;
};

type MessageHandler = (message: WorkerToMainMessage) => void;
type ErrorHandler = (event: ErrorEvent) => void;

export function createWorkerClient({ WorkerCtor }: WorkerClientOptions) {
	let worker: Worker | null = null;
	const messageHandlers = new Set<MessageHandler>();
	const errorHandlers = new Set<ErrorHandler>();

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
		for (const handler of errorHandlers) {
			handler(event);
		}
	};

	const start = () => {
		if (worker) return worker;
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

	return { start, post, terminate, onMessage, onError };
}
