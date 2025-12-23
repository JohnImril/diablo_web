export interface IFileSystem {
	files: Map<string, Uint8Array>;
	update: (name: string, data: Uint8Array) => Promise<unknown>;
	delete: (name: string) => Promise<void>;
	clear: () => Promise<void>;
	download: (name: string) => Promise<void>;
	upload: (file: File) => Promise<void>;
	fileUrl: (name: string) => Promise<string | undefined>;
}

export interface IWebRTCConnection {
	send(packet: ArrayBuffer | Uint8Array): void;
}

export interface IGameHandles {
	worker?: Worker;
	webrtc?: IWebRTCConnection | null;
	webrtcIntervalId?: number | null;
}

export interface IApi {
	updateBelt: (belt: number[]) => void;
	canvas: HTMLCanvasElement;
	fs: Promise<IFileSystem>;
	setCursorPos: (x: number, y: number) => void;
	openKeyboard: (rect: number[] | null) => void;
	onError: (error: string, stack?: string) => void;
	onProgress: (progress: { text: string; loaded: number; total: number }) => void;
	onExit: () => void;
	setCurrentSave: (name: string) => void;
}

export interface IAudioApi {
	create_sound_raw: (
		id: number,
		data: Float32Array,
		length: number,
		channels: number,
		rate: number
	) => void | undefined;
	create_sound: (id: number, data: DataView) => number | void | undefined;
	duplicate_sound: (id: number, srcId: number) => number | void | undefined;
	play_sound: (id: number, volume: number, pan: number, loop: boolean) => void | undefined;
	set_volume: (id: number, volume: number) => void | undefined;
	stop_sound: (id: number) => void | undefined;
	delete_sound: (id: number) => void | undefined;
	stop_all: () => void | undefined;
}

export type GameFunction = ((command: string, ...args: (string | number)[]) => void) & IGameHandles;

export interface IPlayerInfo {
	name: string;
	cls: number;
	level: number;
}

export interface IWebSocketProxy {
	readyState: number;
	send(msg: Uint8Array): void;
	close(): void;
}

export interface IError {
	message: string;
	stack?: string;
	save?: string;
}

export interface IProgress {
	text: string;
	loaded: number;
	total?: number;
}

export interface ITouchOther {
	id: number;
	index: number;
	stick: boolean;
	original: boolean;
	clientX: number;
	clientY: number;
}

export interface IGameOptions {
	cookie: number;
	name: string;
	password: string;
	difficulty?: number;
}

export interface IDisconnectPacket {
	id: number;
	reason: number;
}

export interface IMessagePacket {
	id: number;
	payload: Uint8Array;
}

export interface ITurnPacket {
	id: number;
	turn: number;
}

export interface IJoinPacket {
	cookie: number;
	reason: number;
}

export interface IInfoPacket {
	version: number;
}

export interface IJoinAcceptPacket {
	cookie: number;
	index: number;
	seed: number;
	difficulty?: number;
}

export interface IConnectPacket {
	id: number;
}

export type IEmptyPacket = Record<string, never>;
