type StackFormat = "chrome" | "firefox";

export type MapStackTraceCallback = (mappedStack: string[]) => void;

export type MapStackTraceOptions = {
	filterLine?: (line: string) => boolean;
	resolveSourceMap?: (uri: string) => string | null | Promise<string | null>;
	preloadedSourceMaps?: Record<string, string>;
	cache?: boolean;
	maxStackLines?: number;
	maxSourceMapSize?: number;
	maxFileCount?: number;
};

type ParsedFrame = {
	format: StackFormat;
	source: string;
	line: number;
	column: number;
	name?: string;
};

type MappedPosition = {
	source: string;
	line: number;
	column: number;
	name?: string;
};

type RawSourceMap = {
	version: number;
	sources: string[];
	names?: string[];
	sourceRoot?: string;
	mappings: string;
	file?: string;
	sourcesContent?: Array<string | null>;
	sections?: unknown;
};

type MappingSegment = {
	generatedColumn: number;
	sourceIndex: number;
	originalLine: number;
	originalColumn: number;
	nameIndex: number | null;
};

const DEFAULT_MAX_STACK_LINES = 200;
const DEFAULT_MAX_SOURCEMAP_SIZE = 15 * 1024 * 1024;
const DEFAULT_MAX_FILE_COUNT = 50;

const CHROME_WITH_NAME = /^\s*at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)\s*$/;
const CHROME_NO_NAME = /^\s*at\s+(.+?):(\d+):(\d+)\s*$/;
const FIREFOX_WITH_NAME = /^(.*?)@(.+?):(\d+):(\d+)\s*$/;
const FIREFOX_NO_NAME = /^@?(.+?):(\d+):(\d+)\s*$/;

const SOURCE_MAP_URL = /sourceMappingURL\s*=\s*([^\s'"]+)/g;

const BASE64_CHAR_TO_INT: Record<string, number> = {};
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
for (let i = 0; i < BASE64_CHARS.length; i += 1) {
	BASE64_CHAR_TO_INT[BASE64_CHARS[i]] = i;
}

const sharedConsumerCache = new Map<string, SimpleSourceMapConsumer | null>();
const sharedConsumerPromiseCache = new Map<string, Promise<SimpleSourceMapConsumer | null>>();
const sharedPositionCache = new Map<string, MappedPosition | null>();

export function mapStackTrace(
	stack: string,
	optionsOrCallback?: MapStackTraceOptions | MapStackTraceCallback,
	callback?: MapStackTraceCallback,
): Promise<string[]> {
	const { options, cb } = normalizeArgs(optionsOrCallback, callback);
	const promise = mapStackTraceInternal(stack, options).catch(() => stack.split(/\r?\n/));
	if (cb) {
		promise.then(cb);
	}
	return promise;
}

async function mapStackTraceInternal(stack: string, options: MapStackTraceOptions): Promise<string[]> {
	const lines = stack.split(/\r?\n/);
	const maxStackLines = options.maxStackLines ?? DEFAULT_MAX_STACK_LINES;
	const trimmedLines = lines.slice(0, maxStackLines);
	const format = detectFormat(trimmedLines);
	const useCache = options.cache !== false;

	const seenFiles = new Set<string>();
	const positionCache = useCache ? sharedPositionCache : new Map<string, MappedPosition | null>();
	const consumerCache = useCache ? sharedConsumerCache : new Map<string, SimpleSourceMapConsumer | null>();
	const consumerPromiseCache = useCache
		? sharedConsumerPromiseCache
		: new Map<string, Promise<SimpleSourceMapConsumer | null>>();

	const mappedLines = await Promise.all(
		trimmedLines.map(async (line) => {
			if (options.filterLine && !options.filterLine(line)) {
				return line;
			}

			const parsed = parseLineWithFallback(line, format);
			if (!parsed) {
				return line;
			}

			const frame = await mapFrame(parsed, {
				options,
				seenFiles,
				positionCache,
				consumerCache,
				consumerPromiseCache,
			});

			return formatFrame(frame);
		}),
	);

	return mappedLines;
}

function normalizeArgs(
	optionsOrCallback?: MapStackTraceOptions | MapStackTraceCallback,
	callback?: MapStackTraceCallback,
): { options: MapStackTraceOptions; cb?: MapStackTraceCallback } {
	if (typeof optionsOrCallback === "function") {
		return { options: {}, cb: optionsOrCallback };
	}
	if (callback) {
		return { options: optionsOrCallback ?? {}, cb: callback };
	}
	return { options: optionsOrCallback ?? {} };
}

function detectFormat(lines: string[]): StackFormat {
	let chromeMatches = 0;
	let firefoxMatches = 0;

	for (const line of lines) {
		if (CHROME_WITH_NAME.test(line) || CHROME_NO_NAME.test(line)) {
			chromeMatches += 1;
		}
		if (FIREFOX_WITH_NAME.test(line)) {
			firefoxMatches += 1;
		}
	}

	return chromeMatches >= firefoxMatches ? "chrome" : "firefox";
}

function parseLineWithFallback(line: string, format: StackFormat): ParsedFrame | null {
	const primary = parseLine(line, format);
	if (primary) {
		return primary;
	}
	const fallback = format === "chrome" ? "firefox" : "chrome";
	return parseLine(line, fallback);
}

function parseLine(line: string, format: StackFormat): ParsedFrame | null {
	if (format === "chrome") {
		const named = CHROME_WITH_NAME.exec(line);
		if (named) {
			const [, name, source, lineStr, columnStr] = named;
			return buildParsedFrame("chrome", name, source, lineStr, columnStr);
		}

		const unnamed = CHROME_NO_NAME.exec(line);
		if (unnamed) {
			const [, source, lineStr, columnStr] = unnamed;
			return buildParsedFrame("chrome", undefined, source, lineStr, columnStr);
		}
		return null;
	}

	const named = FIREFOX_WITH_NAME.exec(line);
	if (named) {
		const [, name, source, lineStr, columnStr] = named;
		return buildParsedFrame("firefox", name, source, lineStr, columnStr);
	}

	const unnamed = FIREFOX_NO_NAME.exec(line);
	if (unnamed) {
		const [, source, lineStr, columnStr] = unnamed;
		return buildParsedFrame("firefox", undefined, source, lineStr, columnStr);
	}

	return null;
}

function buildParsedFrame(
	format: StackFormat,
	name: string | undefined,
	source: string,
	lineStr: string,
	columnStr: string,
): ParsedFrame | null {
	if (!source || source.includes("native")) {
		return null;
	}
	const line = Number(lineStr);
	const column = Number(columnStr);
	if (!Number.isFinite(line) || !Number.isFinite(column)) {
		return null;
	}
	return {
		format,
		source,
		line,
		column,
		name: name && name.trim().length > 0 ? name.trim() : undefined,
	};
}

async function mapFrame(
	frame: ParsedFrame,
	context: {
		options: MapStackTraceOptions;
		seenFiles: Set<string>;
		positionCache: Map<string, MappedPosition | null>;
		consumerCache: Map<string, SimpleSourceMapConsumer | null>;
		consumerPromiseCache: Map<string, Promise<SimpleSourceMapConsumer | null>>;
	},
): Promise<MappedPosition> {
	const { options, seenFiles, positionCache, consumerCache, consumerPromiseCache } = context;
	const maxFileCount = options.maxFileCount ?? DEFAULT_MAX_FILE_COUNT;
	if (!seenFiles.has(frame.source)) {
		if (seenFiles.size >= maxFileCount) {
			return frame;
		}
		seenFiles.add(frame.source);
	}

	const positionKey = `${frame.source}:${frame.line}:${frame.column}`;
	const cachedPosition = positionCache.get(positionKey);
	if (cachedPosition !== undefined) {
		return cachedPosition ?? frame;
	}

	const consumer = await getConsumer(frame.source, options, consumerCache, consumerPromiseCache);
	if (!consumer) {
		positionCache.set(positionKey, null);
		return frame;
	}

	const mapped = consumer.originalPositionFor(frame.line, frame.column);
	if (!mapped) {
		positionCache.set(positionKey, null);
		return frame;
	}

	const mappedFrame: MappedPosition = {
		source: mapped.source ?? frame.source,
		line: mapped.line ?? frame.line,
		column: mapped.column ?? frame.column,
		name: mapped.name ?? frame.name,
	};
	positionCache.set(positionKey, mappedFrame);
	return mappedFrame;
}

function formatFrame(frame: MappedPosition): string {
	const name = frame.name?.trim().length ? frame.name.trim() : "<anonymous>";
	return `at ${name} (${frame.source}:${frame.line}:${frame.column})`;
}

async function getConsumer(
	uri: string,
	options: MapStackTraceOptions,
	consumerCache: Map<string, SimpleSourceMapConsumer | null>,
	consumerPromiseCache: Map<string, Promise<SimpleSourceMapConsumer | null>>,
): Promise<SimpleSourceMapConsumer | null> {
	const cached = consumerCache.get(uri);
	if (cached !== undefined) {
		return cached;
	}

	const inflight = consumerPromiseCache.get(uri);
	if (inflight) {
		return inflight;
	}

	const promise = resolveSourceMapForUri(uri, options)
		.then((map) => (map ? new SimpleSourceMapConsumer(map) : null))
		.catch(() => null)
		.then((consumer) => {
			consumerCache.set(uri, consumer);
			consumerPromiseCache.delete(uri);
			return consumer;
		});

	consumerPromiseCache.set(uri, promise);
	return promise;
}

async function resolveSourceMapForUri(uri: string, options: MapStackTraceOptions): Promise<RawSourceMap | null> {
	const preloaded = options.preloadedSourceMaps?.[uri];
	if (preloaded) {
		return parseSourceMapFromString(preloaded, options.maxSourceMapSize ?? DEFAULT_MAX_SOURCEMAP_SIZE);
	}

	if (!options.resolveSourceMap) {
		return null;
	}

	const result = await options.resolveSourceMap(uri);
	if (!result) {
		return null;
	}

	return parseSourceMapFromString(result, options.maxSourceMapSize ?? DEFAULT_MAX_SOURCEMAP_SIZE);
}

function parseSourceMapFromString(source: string, maxSize: number): RawSourceMap | null {
	if (byteLength(source) > maxSize) {
		return null;
	}

	const trimmed = source.trim();
	const asDataUrl = tryParseDataUrl(trimmed);
	if (asDataUrl) {
		return asDataUrl;
	}

	if (trimmed.startsWith("{")) {
		return parseSourceMapJson(trimmed);
	}

	const extracted = extractDataUrlSourceMap(trimmed);
	if (extracted) {
		return extracted;
	}

	return null;
}

function extractDataUrlSourceMap(sourceText: string): RawSourceMap | null {
	let lastMatch: string | null = null;
	for (const match of sourceText.matchAll(SOURCE_MAP_URL)) {
		lastMatch = match[1] ?? null;
	}
	if (!lastMatch) {
		return null;
	}
	return tryParseDataUrl(lastMatch);
}

function tryParseDataUrl(value: string): RawSourceMap | null {
	if (!value.startsWith("data:")) {
		return null;
	}
	const commaIndex = value.indexOf(",");
	if (commaIndex === -1) {
		return null;
	}

	const header = value.slice(0, commaIndex);
	const body = value.slice(commaIndex + 1);
	const isBase64 = header.includes(";base64");
	const isJson = header.includes("application/json");
	if (!isJson) {
		return null;
	}

	const decoded = isBase64 ? decodeBase64(body) : safeDecodeURIComponent(body);
	if (!decoded) {
		return null;
	}

	return parseSourceMapJson(decoded);
}

function parseSourceMapJson(json: string): RawSourceMap | null {
	try {
		const parsed = JSON.parse(json) as RawSourceMap;
		if (!parsed || parsed.version !== 3 || !Array.isArray(parsed.sources) || typeof parsed.mappings !== "string") {
			return null;
		}
		if (parsed.sections) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function safeDecodeURIComponent(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

function decodeBase64(value: string): string | null {
	if (typeof atob !== "function") {
		const buffer = getBuffer();
		if (!buffer) {
			return null;
		}
		return buffer.from(value, "base64").toString("utf-8");
	}
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	if (typeof TextDecoder !== "undefined") {
		return new TextDecoder("utf-8").decode(bytes);
	}
	return String.fromCharCode(...bytes);
}

function byteLength(value: string): number {
	if (typeof TextEncoder !== "undefined") {
		return new TextEncoder().encode(value).length;
	}
	const buffer = getBuffer();
	if (buffer) {
		return buffer.byteLength(value);
	}
	return value.length;
}

function getBuffer(): { from: (data: string, encoding: "base64") => { toString: (enc: "utf-8") => string }; byteLength: (data: string) => number } | null {
	const globalWithBuffer = globalThis as unknown as {
		Buffer?: {
			from: (data: string, encoding: "base64") => { toString: (enc: "utf-8") => string };
			byteLength: (data: string) => number;
		};
	};
	return globalWithBuffer.Buffer ?? null;
}

class SimpleSourceMapConsumer {
	private sources: string[];
	private names: string[];
	private sourceRoot?: string;
	private mappingsByLine: MappingSegment[][];

	constructor(map: RawSourceMap) {
		this.sources = map.sources;
		this.names = map.names ?? [];
		this.sourceRoot = map.sourceRoot;
		this.mappingsByLine = parseMappings(map.mappings);
	}

	originalPositionFor(line: number, column: number): MappedPosition | null {
		const lineIndex = line - 1;
		if (lineIndex < 0 || lineIndex >= this.mappingsByLine.length) {
			return null;
		}
		const segments = this.mappingsByLine[lineIndex];
		if (!segments || segments.length === 0) {
			return null;
		}

		const columnIndex = Math.max(column - 1, 0);
		let low = 0;
		let high = segments.length - 1;
		let matchIndex = -1;
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const midColumn = segments[mid].generatedColumn;
			if (midColumn === columnIndex) {
				matchIndex = mid;
				break;
			}
			if (midColumn < columnIndex) {
				matchIndex = mid;
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}

		if (matchIndex === -1) {
			return null;
		}

		const segment = segments[matchIndex];
		const source = this.sources[segment.sourceIndex];
		if (!source) {
			return null;
		}

		return {
			source: resolveSourcePath(this.sourceRoot, source),
			line: segment.originalLine + 1,
			column: segment.originalColumn + 1,
			name: segment.nameIndex !== null ? this.names[segment.nameIndex] : undefined,
		};
	}
}

function parseMappings(mappings: string): MappingSegment[][] {
	const lines: MappingSegment[][] = [];
	let sourceIndex = 0;
	let originalLine = 0;
	let originalColumn = 0;
	let nameIndex = 0;

	const lineStrings = mappings.split(";");
	for (let line = 0; line < lineStrings.length; line += 1) {
		const segments: MappingSegment[] = [];
		let generatedColumn = 0;
		const segmentStrings = lineStrings[line].split(",");
		for (const segment of segmentStrings) {
			if (!segment) {
				continue;
			}
			const indexRef = { index: 0 };
			const generatedColumnDelta = decodeVLQ(segment, indexRef);
			if (generatedColumnDelta === null) {
				continue;
			}
			generatedColumn += generatedColumnDelta;
			if (indexRef.index >= segment.length) {
				continue;
			}
			const sourceIndexDelta = decodeVLQ(segment, indexRef);
			const originalLineDelta = decodeVLQ(segment, indexRef);
			const originalColumnDelta = decodeVLQ(segment, indexRef);
			if (sourceIndexDelta === null || originalLineDelta === null || originalColumnDelta === null) {
				continue;
			}
			sourceIndex += sourceIndexDelta;
			originalLine += originalLineDelta;
			originalColumn += originalColumnDelta;
			let nameIndexDelta: number | null = null;
			if (indexRef.index < segment.length) {
				nameIndexDelta = decodeVLQ(segment, indexRef);
				if (nameIndexDelta === null) {
					nameIndexDelta = null;
				} else {
					nameIndex += nameIndexDelta;
				}
			}

			segments.push({
				generatedColumn,
				sourceIndex,
				originalLine,
				originalColumn,
				nameIndex: nameIndexDelta === null ? null : nameIndex,
			});
		}
		lines.push(segments);
	}

	return lines;
}

function decodeVLQ(segment: string, indexRef: { index: number }): number | null {
	let result = 0;
	let shift = 0;
	let continuation = true;

	while (continuation) {
		if (indexRef.index >= segment.length) {
			return null;
		}
		const char = segment[indexRef.index];
		indexRef.index += 1;
		const charValue = BASE64_CHAR_TO_INT[char];
		if (charValue === undefined) {
			return null;
		}
		continuation = (charValue & 32) === 32;
		const digit = charValue & 31;
		result += digit << shift;
		shift += 5;
	}

	const isNegative = (result & 1) === 1;
	const shifted = result >> 1;
	return isNegative ? -shifted : shifted;
}

function resolveSourcePath(sourceRoot: string | undefined, source: string): string {
	if (!sourceRoot) {
		return source;
	}
	if (isAbsoluteUrl(source) || source.startsWith("file://") || source.startsWith("/")) {
		return source;
	}
	if (isAbsoluteUrl(sourceRoot)) {
		try {
			return new URL(source, sourceRoot).toString();
		} catch {
			return `${trimTrailingSlash(sourceRoot)}/${source}`;
		}
	}
	return `${trimTrailingSlash(sourceRoot)}/${source}`;
}

function isAbsoluteUrl(value: string): boolean {
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function trimTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}
