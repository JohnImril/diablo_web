export interface IFileSystem {
	files: Map<string, Uint8Array>;
	update: (name: string, data: Uint8Array) => Promise<unknown>;
	delete: (name: string) => Promise<void>;
	clear: () => Promise<void>;
	download: (name: string) => Promise<void>;
	upload: (file: File) => Promise<void>;
	fileUrl: (name: string) => Promise<string | undefined>;
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
