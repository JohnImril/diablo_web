import Peer from "peerjs";

//TODO: refuse to declare
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
