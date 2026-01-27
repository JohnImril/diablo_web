import type { IWebSocketProxy } from "../../../types";

type WebSocketHandler = (data: ArrayBuffer | string) => void;
type WebSocketFinisher = (code: number) => void;

const MAX_OUTBOX_MESSAGES = 256;
const MAX_OUTBOX_BYTES = 14 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 15000;

async function do_websocket_open(url: string, handler: WebSocketHandler) {
	const socket = new WebSocket(url);
	socket.binaryType = "arraybuffer";

	let versionCbk: ((data: ArrayBuffer | string) => void) | null = null;

	socket.addEventListener("message", ({ data }: MessageEvent) => {
		if (versionCbk) {
			versionCbk(data);
		}
		handler(data);
	});

	await new Promise<void>((resolve, reject) => {
		const to = setTimeout(() => {
			socket.removeEventListener("error", onError);
			reject(1);
		}, CONNECT_TIMEOUT_MS);
		const onError = () => {
			clearTimeout(to);
			reject(1);
		};
		socket.addEventListener("error", onError);
		socket.addEventListener("open", () => {
			clearTimeout(to);
			socket.removeEventListener("error", onError);
			resolve();
		});
	});

	await new Promise<void>((resolve, reject) => {
		const to = setTimeout(() => {
			versionCbk = null;
			reject(1);
		}, 5000);

		versionCbk = (data: ArrayBuffer | string) => {
			clearTimeout(to);
			const u8 = new Uint8Array(data as ArrayBuffer);
			if (u8[0] === 0x32) {
				versionCbk = null;
				const version = u8[1] | (u8[2] << 8) | (u8[3] << 16) | (u8[4] << 24);
				if (version === 1) {
					resolve();
				} else {
					reject(2);
				}
			}
		};
	});

	const vers = import.meta.env.VITE_APP_VERSION.match(/(\d+)\.(\d+)\.(\d+)/);
	const clientInfo = new Uint8Array(5);
	clientInfo[0] = 0x31;
	clientInfo[1] = parseInt(vers![3]);
	clientInfo[2] = parseInt(vers![2]);
	clientInfo[3] = parseInt(vers![1]);
	clientInfo[4] = 0;
	socket.send(clientInfo);
	return socket;
}

export default function websocket_open(url: string, handler: WebSocketHandler, finisher: WebSocketFinisher) {
	let ws: WebSocket | null = null;
	let batch: Uint8Array[] | null = [];
	let batchBytes = 0;
	let intr: number | null = null;
	let finished = false;
	let overflowLogged = false;

	const finish = (code: number) => {
		if (finished) return;
		finished = true;
		finisher(code);
	};

	const handleOverflow = (reason: string) => {
		if (!overflowLogged) {
			overflowLogged = true;
			console.warn(`[ws-client] outbox overflow: ${reason}`, {
				messages: batch?.length ?? 0,
				bytes: batchBytes,
			});
		}
		batch = null;
		batchBytes = 0;
		try {
			ws?.close(1009, "outbox overflow");
		} catch {
			/* empty */
		}
		finish(1);
	};

	const proxy: IWebSocketProxy = {
		get readyState() {
			return ws ? ws.readyState : 0;
		},
		send(msg: Uint8Array) {
			if (!batch) {
				return;
			}
			const cloned = msg.slice();
			batch.push(cloned);
			batchBytes += cloned.byteLength;
			if (batch.length > MAX_OUTBOX_MESSAGES || batchBytes > MAX_OUTBOX_BYTES) {
				handleOverflow("pending messages exceeded limits");
			}
		},
		close() {
			if (intr) {
				clearInterval(intr);
				intr = null;
			}
			batch = null;
			batchBytes = 0;
			if (ws) {
				ws.close();
			}
		},
	};

	do_websocket_open(url, handler).then(
		(sock) => {
			ws = sock;
			if (batch) {
				intr = setInterval(() => {
					if (!batch!.length) {
						return;
					}
					const size = batch!.reduce((sum, msg) => sum + msg.byteLength, 3);
					const buffer = new Uint8Array(size);
					buffer[0] = 0;
					buffer[1] = batch!.length & 0xff;
					buffer[2] = batch!.length >> 8;

					let pos = 3;
					for (const msg of batch!) {
						buffer.set(msg, pos);
						pos += msg.byteLength;
					}

					ws!.send(buffer);

					batch!.length = 0;
					batchBytes = 0;
				}, 100);
			} else {
				ws.close();
			}
			finish(0);
		},
		(err) => {
			batch = null;
			batchBytes = 0;
			finish(err);
		}
	);
	return proxy;
}
