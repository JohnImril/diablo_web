import type { IProgress } from "../../types";

export type RuntimeEventMap = {
	progress: IProgress;
	error: { message: string; stack?: string; saveUrl?: string };
	ready: { startedAt: number };
	exit: { reason?: string };
	saveChanged: { name: string | null };
	savesChanged: { names: string[] };
	netPacket: { data: ArrayBuffer };
	netBatch: { data: ArrayBuffer[] };
	netError: { message: string; stack?: string };
	state: { value: string };
};

type Handler<T> = (payload: T) => void;

export function createRuntimeEventEmitter() {
	const listeners = new Map<keyof RuntimeEventMap, Set<Handler<unknown>>>();

	const on = <K extends keyof RuntimeEventMap>(event: K, handler: Handler<RuntimeEventMap[K]>): (() => void) => {
		const existing = listeners.get(event) ?? new Set();
		existing.add(handler as Handler<unknown>);
		listeners.set(event, existing);
		return () => off(event, handler);
	};

	const emit = <K extends keyof RuntimeEventMap>(event: K, payload: RuntimeEventMap[K]) => {
		const handlers = listeners.get(event);
		if (!handlers) return;
		for (const handler of handlers) {
			(handler as Handler<RuntimeEventMap[K]>)(payload);
		}
	};

	const off = <K extends keyof RuntimeEventMap>(event: K, handler: Handler<RuntimeEventMap[K]>) => {
		const handlers = listeners.get(event);
		if (!handlers) return;
		handlers.delete(handler as Handler<unknown>);
		if (!handlers.size) listeners.delete(event);
	};

	const clear = () => {
		listeners.clear();
	};

	return { on, off, emit, clear };
}
