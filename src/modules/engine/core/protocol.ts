import type { IProgress } from "types";

export const PROTOCOL_VERSION = 1;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isBinary = (value: unknown): value is ArrayBuffer | Uint8Array =>
	value instanceof ArrayBuffer || value instanceof Uint8Array;
const isStringOrNumber = (value: unknown): value is string | number => isString(value) || isNumber(value);
const isNumberList = (value: unknown): value is number[] | Uint8Array =>
	(Array.isArray(value) && value.every(isNumber)) || value instanceof Uint8Array;

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

function hasValidEnvelope(data: unknown, types: readonly string[]): data is Record<string, unknown> {
	if (!isObject(data)) return false;
	return (
		data.v === PROTOCOL_VERSION &&
		isString(data.type) &&
		types.includes(data.type) &&
		data.action === data.type
	);
}

function isRenderBatch(value: unknown): boolean {
	if (!isObject(value) || !isNumberList(value.belt)) return false;
	if ("bitmap" in value && value.bitmap != null) return typeof value.bitmap === "object";
	if (!Array.isArray(value.images) || !Array.isArray(value.text)) return false;
	return (
		value.images.every((image) => {
			if (!isObject(image)) return false;
			if (
				!isNumber(image.x) ||
				!isNumber(image.y) ||
				!isNumber(image.w) ||
				!isNumber(image.h) ||
				!isBinary(image.data)
			)
				return false;
			return image.w > 0 && image.h > 0 && image.w * image.h * 4 === image.data.byteLength;
		}) &&
		value.text.every(
			(item) =>
				isObject(item) &&
				isNumber(item.x) &&
				isNumber(item.y) &&
				isString(item.text) &&
				isNumber(item.color)
		)
	);
}

export function isMainToWorkerMessage(data: unknown): data is MainToWorkerMessage {
	if (!hasValidEnvelope(data, MAIN_TO_WORKER_TYPES)) return false;
	switch (data.action) {
		case "init":
			return (
				data.files instanceof Map &&
				(data.mpq === null || data.mpq instanceof File) &&
				typeof data.spawn === "boolean" &&
				typeof data.offscreen === "boolean"
			);
		case "event":
			return isString(data.func) && Array.isArray(data.params) && data.params.every(isStringOrNumber);
		case "packet":
			return isBinary(data.buffer);
		case "packetBatch":
			return Array.isArray(data.batch) && data.batch.every((packet) => packet instanceof ArrayBuffer);
		default:
			return false;
	}
}

export function isWorkerToMainMessage(data: unknown): data is WorkerToMainMessage {
	if (!hasValidEnvelope(data, WORKER_TO_MAIN_TYPES)) return false;
	switch (data.action) {
		case "loaded":
		case "exit":
			return true;
		case "render":
			return isRenderBatch(data.batch);
		case "audio":
			return isString(data.func) && Array.isArray(data.params);
		case "audioBatch":
			return Array.isArray(data.batch);
		case "fs":
			return isString(data.func) && Array.isArray(data.params);
		case "cursor":
			return isNumber(data.x) && isNumber(data.y);
		case "keyboard":
			return data.rect === null || (Array.isArray(data.rect) && data.rect.every(isNumber));
		case "error":
		case "failed":
			return isString(data.error) && (data.stack === undefined || isString(data.stack));
		case "progress":
			return (
				isString(data.text) &&
				isNumber(data.loaded) &&
				(data.total === undefined || isNumber(data.total))
			);
		case "current_save":
			return data.name === null || isString(data.name);
		case "packet":
			return isBinary(data.buffer);
		case "packetBatch":
			return Array.isArray(data.batch) && data.batch.every((packet) => packet instanceof ArrayBuffer);
		default:
			return false;
	}
}
