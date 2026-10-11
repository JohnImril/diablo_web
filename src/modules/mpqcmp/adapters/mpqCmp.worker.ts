// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import MpqModule from "./mpqCmp.jscc";
import { loadEmscriptenModule } from "shared/emscriptenModule";
import { normalizeError } from "shared/normalizeError";
import { repairStoredSectors } from "./repairStoredSectors";

const worker: Worker & { DApi?: IDApi } = self as unknown as Worker & { DApi?: IDApi };

let input_file: Uint8Array | null = null;
let input_offset = 0;
let output_file: Uint8Array<ArrayBuffer> | null = null;
let last_progress = 0;
let stage = "Initializing worker";

function progress(value: number) {
	worker.postMessage({ action: "progress", value });
}

const DApi: IDApi = {
	exit_error(error: string) {
		throw Error(error);
	},

	get_file_contents(array: Uint8Array, offset: number) {
		if (input_file) {
			const start = offset - input_offset;
			array.set(input_file.subarray(start, start + array.byteLength));
		}
	},

	put_file_size(size: number) {
		output_file = new Uint8Array(size);
	},

	put_file_contents(array: Uint8Array, offset: number) {
		if (output_file) {
			output_file.set(array, offset);
		}
	},

	progress(done: number, total: number) {
		const now = performance.now();
		if (done === total || now > last_progress + 100) {
			progress(done);
			last_progress = now;
		}
	},
};

worker.DApi = DApi;

async function run({ binary, mpq, input, offset, blockSize }: IWorkerMessageData) {
	if (!binary || !mpq || !input || offset === undefined || blockSize === undefined) {
		throw new Error("Invalid arguments passed to the worker");
	}

	stage = "Initializing compression WASM";
	const wasm = await loadEmscriptenModule<MpqWasmApi, { wasmBinary: ArrayBuffer }>(MpqModule, {
		wasmBinary: binary,
	});

	input_file = new Uint8Array(mpq);
	input_offset = offset;
	wasm.prepareCompressionStack();

	const count = input.length / 6;
	const ptr = wasm._DApi_Alloc(input.byteLength);
	wasm.HEAPU32.set(input, ptr >> 2);

	stage = "Compressing MPQ entries";
	const dst = wasm._DApi_Compress(offset + input_file.length, blockSize, count, ptr) >> 2;
	wasm.checkCompressionStack();
	if (!output_file) throw new Error("Compression WASM did not produce output");
	const blocks = wasm.HEAPU32.slice(dst, dst + count * 4);
	stage = "Validating compressed sectors";
	await repairStoredSectors(output_file!, blocks);
	stage = "Transferring compressed output";

	worker.postMessage({ action: "result", buffer: output_file!.buffer, blocks }, [output_file!.buffer, blocks.buffer]);
}

worker.addEventListener("message", ({ data }: { data: IWorkerMessageData }) => {
	if (data.action === "run") {
		run(data).catch((err) => {
			const error = normalizeError(err);
			worker.postMessage({
				action: "error",
				error: `${error.name}: ${error.message}`,
				stack: error.stack,
				diagnostics: {
					stage,
					errorDetails: error.details,
					offset: data.offset,
					blockSize: data.blockSize,
					entries: data.input ? data.input.length / 6 : undefined,
				},
			});
		});
	}
});

export default null;

interface IWorkerMessageData {
	action: string;
	binary?: ArrayBuffer;
	mpq?: ArrayBuffer;
	input?: Uint32Array;
	offset?: number;
	blockSize?: number;
}

interface IDApi {
	exit_error(error: string): never;
	get_file_contents(array: Uint8Array, offset: number): void;
	put_file_size(size: number): void;
	put_file_contents(array: Uint8Array, offset: number): void;
	progress(done: number, total: number): void;
}

interface MpqWasmApi {
	prepareCompressionStack(): void;
	checkCompressionStack(): void;
	_DApi_Alloc(size: number): number;
	_DApi_Compress(size: number, blockSize: number, count: number, input: number): number;
	HEAPU32: Uint32Array;
}
