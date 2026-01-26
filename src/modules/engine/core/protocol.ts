import type { IProgress } from "../../../types";

export const PROTOCOL_VERSION = 1;

type BaseMessage<Type extends string> = {
	v: number;
	type: Type;
	action: Type;
};

export type MainToWorkerMessage =
	| (BaseMessage<"init"> & {
			files: Map<string, Uint8Array>;
			mpq: File | null;
			spawn: boolean;
			offscreen: boolean;
	  })
	| (BaseMessage<"event"> & {
			func: string;
			params: (string | number)[];
	  })
	| (BaseMessage<"packet"> & {
			buffer: ArrayBuffer | Uint8Array;
	  })
	| (BaseMessage<"packetBatch"> & {
			batch: ArrayBuffer[];
	  });

export type WorkerToMainMessage =
	| BaseMessage<"loaded">
	| (BaseMessage<"render"> & { batch: unknown })
	| (BaseMessage<"audio"> & { func: string; params: unknown[] })
	| (BaseMessage<"audioBatch"> & { batch: unknown[] })
	| (BaseMessage<"fs"> & { func: string; params: unknown[] })
	| (BaseMessage<"cursor"> & { x: number; y: number })
	| (BaseMessage<"keyboard"> & { rect: number[] | null })
	| (BaseMessage<"error"> & { error: string; stack?: string })
	| (BaseMessage<"failed"> & { error: string; stack?: string })
	| (BaseMessage<"progress"> & IProgress)
	| BaseMessage<"exit">
	| (BaseMessage<"current_save"> & { name: string | null })
	| (BaseMessage<"packet"> & { buffer: ArrayBuffer | Uint8Array })
	| (BaseMessage<"packetBatch"> & { batch: ArrayBuffer[] });

const MAIN_TO_WORKER_TYPES = ["init", "event", "packet", "packetBatch"] as const;
const WORKER_TO_MAIN_TYPES = [
	"loaded",
	"render",
	"audio",
	"audioBatch",
	"fs",
	"cursor",
	"keyboard",
	"error",
	"failed",
	"progress",
	"exit",
	"current_save",
	"packet",
	"packetBatch",
] as const;

export function isMainToWorkerMessage(data: unknown): data is MainToWorkerMessage {
	if (!data || typeof data !== "object") return false;
	const msg = data as { v?: unknown; type?: unknown };
	return typeof msg.v === "number" && MAIN_TO_WORKER_TYPES.includes(msg.type as (typeof MAIN_TO_WORKER_TYPES)[number]);
}

export function isWorkerToMainMessage(data: unknown): data is WorkerToMainMessage {
	if (!data || typeof data !== "object") return false;
	const msg = data as { v?: unknown; type?: unknown };
	return typeof msg.v === "number" && WORKER_TO_MAIN_TYPES.includes(msg.type as (typeof WORKER_TO_MAIN_TYPES)[number]);
}
