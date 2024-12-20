import { IWebSocketProxy } from "../types";

type WebSocketHandler = (data: ArrayBuffer | string) => void;
type WebSocketFinisher = (code: number) => void;

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
		const onError = () => reject(1);
		socket.addEventListener("error", onError);
		socket.addEventListener("open", () => {
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

	const vers = __APP_VERSION__.match(/(\d+)\.(\d+)\.(\d+)/);
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
	let ws: WebSocket | null = null,
		batch: Uint8Array[] = [],
		intr: number | null = null;

	const proxy: IWebSocketProxy = {
		get readyState() {
			return ws ? ws.readyState : 0;
		},
		send(msg: Uint8Array) {
			batch.push(msg.slice());
		},
		close() {
			if (intr) {
				clearInterval(intr);
				intr = null;
			}
			if (ws) {
				ws.close();
			} else {
				batch = null!;
			}
		},
	};

	do_websocket_open(url, handler).then(
		(sock) => {
			ws = sock;
			if (batch) {
				intr = setInterval(() => {
					if (!batch.length) {
						return;
					}
					const size = batch.reduce((sum, msg) => sum + msg.byteLength, 3);
					const buffer = new Uint8Array(size);
					buffer[0] = 0;
					buffer[1] = batch.length & 0xff;
					buffer[2] = batch.length >> 8;
					let pos = 3;
					for (const msg of batch) {
						buffer.set(msg, pos);
						pos += msg.byteLength;
					}
					ws?.send(buffer);
					batch.length = 0;
				}, 100);
			} else {
				ws.close();
			}
			finisher(0);
		},
		(err) => {
			finisher(err);
		}
	);
	return proxy;
}
