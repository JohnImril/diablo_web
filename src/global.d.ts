import Peer from "peerjs";

declare global {
	interface Window {
		Peer: typeof Peer;
	}
}

declare global {
	interface Window {
		webkitAudioContext?: typeof AudioContext;
		DownloadFile: (name: string) => void;
		DownloadSaves: () => void;
	}
}
