declare global {
	interface Window {
		Peer?: typeof Peer;
		DownloadFile: (name: string) => void;
		DownloadSaves: () => void;
	}
}

export {};
