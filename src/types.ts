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
