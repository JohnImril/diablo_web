import type { DataConnection, PeerOptions } from "peerjs";
import {
	createBufferReader,
	read_packet,
	write_packet,
	client_packet,
	server_packet,
	RejectionReason,
} from "../core/packetCodec";
import type { IDisconnectPacket, IGameOptions, IInfoPacket, IMessagePacket, ITurnPacket } from "../../../types";
import { toUint8 } from "../../../shared/buffers";
import type { AnyBuf } from "../../../shared/buffers";
import type { Packet, PacketBatch } from "../core/packetTypes";

type MessageHandler = (packet: AnyBuf) => void;
type CloseHandler = () => void;

type PacketHandler = (packet: Packet) => void;
type BatchHandler = (packets: PacketBatch) => void;
type ErrorHandler = (error: unknown) => void;

interface PeerData {
	conn: DataConnection;
	id?: number | null;
	version?: number;
}

const PeerID = (name: string) => `diabloweb_dDv62yHQrZJP28tBEHL_${name}`;
const Options: PeerOptions = { port: 443, secure: true, debug: import.meta.env.PROD ? 0 : 3 };
const MAX_PLRS = 4;

let PeerClass: typeof import("peerjs").default | null = null;

const getPeerClass = async () => {
	if (!PeerClass) {
		const mod = await import("peerjs");
		PeerClass = mod.default;
	}
	return PeerClass;
};

type WebRTCServer = ReturnType<typeof createWebRTCServer>;
type WebRTCClient = ReturnType<typeof createWebRTCClient>;

const createWebRTCServer = (
	version: number,
	{ cookie, name, password, difficulty }: IGameOptions,
	onMessage: MessageHandler,
	onClose: CloseHandler
) => {
	let peerInstance: import("peerjs").default | null = null;
	const players: PeerData[] = [];
	const seed = Math.floor(Math.random() * Math.pow(2, 32));

	const send = (mask: number, pkt: ArrayBuffer | Uint8Array) => {
		for (let i = 1; i < MAX_PLRS; ++i) {
			if (mask & (1 << i) && players[i]) {
				players[i].conn?.send(pkt);
			}
		}
		if (mask & 1) {
			onMessage(pkt);
		}
	};

	const drop = (id: number, reason: number) => {
		if (id === 0) {
			for (let i = 1; i < MAX_PLRS; ++i) {
				drop(i, 0x40000006);
			}
			onMessage(write_packet(server_packet.disconnect, { id, reason }));
			peerInstance?.destroy();
			onClose();
		} else if (players[id]) {
			send(0xff, toUint8(write_packet(server_packet.disconnect, { id, reason })));
			players[id].id = null;
			players[id].conn?.close();
			players[id] = null as unknown as PeerData;
		}
	};

	const handle = (id: number, code: number, pkt: unknown) => {
		switch (code) {
			case client_packet.leave_game.code:
				drop(id, 3);
				break;
			case client_packet.drop_player.code:
				drop((pkt as IDisconnectPacket).id, (pkt as IDisconnectPacket).reason);
				break;
			case client_packet.message.code:
				send(
					(pkt as IMessagePacket).id === 0xff ? ~(1 << id) : 1 << (pkt as IMessagePacket).id,
					toUint8(write_packet(server_packet.message, { id, payload: (pkt as IMessagePacket).payload }))
				);
				break;
			case client_packet.turn.code:
				send(
					~(1 << id),
					toUint8(write_packet(server_packet.turn, { id, turn: (pkt as ITurnPacket).turn }))
				);
				break;
			default:
				throw new Error(`invalid packet ${code}`);
		}
	};

	const onConnect = (conn: DataConnection) => {
		const peer: PeerData = { conn };
		conn.on("data", (packet) => {
			const reader = createBufferReader(packet as ArrayBuffer | Uint8Array);
			const { type, packet: pkt } = read_packet(reader, client_packet);
			switch (type.code) {
				case client_packet.info.code:
					peer.version = (pkt as IInfoPacket).version;
					break;
				case client_packet.join_game.code: {
					const joinPacket = pkt as IGameOptions;
					if (peer.version !== version) {
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: joinPacket.cookie,
								reason: RejectionReason.JOIN_VERSION_MISMATCH,
							})
						);
					} else if (joinPacket.name !== name) {
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: joinPacket.cookie,
								reason: RejectionReason.JOIN_GAME_NOT_FOUND,
							})
						);
					} else if (joinPacket.password !== password) {
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: joinPacket.cookie,
								reason: RejectionReason.JOIN_INCORRECT_PASSWORD,
							})
						);
					} else {
						let i = 1;
						while (i < MAX_PLRS && players[i]) {
							++i;
						}
						if (i >= MAX_PLRS) {
							conn.send(
								write_packet(server_packet.join_reject, {
									cookie: joinPacket.cookie,
									reason: RejectionReason.JOIN_GAME_FULL,
								})
							);
						} else {
							players[i] = peer;
							peer.id = i;
							conn.send(
								write_packet(server_packet.join_accept, {
									cookie: joinPacket.cookie,
									index: i,
									seed,
									difficulty,
								})
							);
							send(0xff, toUint8(write_packet(server_packet.connect, { id: i })));
						}
					}
					break;
				}
				default:
					if (peer.id != null) {
						handle(peer.id, type.code, pkt);
					} else {
						return;
					}
			}
			if (!reader.done()) {
				throw Error("packet too large");
			}
		});
		conn.on("close", () => {
			if (peer.id != null) {
				drop(peer.id, 0x40000006);
			}
		});
	};

	const init = async (cookieValue: number) => {
		const Peer = await getPeerClass();
		const peer = new Peer(PeerID(name), Options);
		peerInstance = peer;

		peer.on("connection", (conn: DataConnection) => onConnect(conn));

		peer.on("open", () => {
			setTimeout(() => {
				onMessage(
					write_packet(server_packet.join_accept, {
						cookie: cookieValue,
						index: 0,
						seed,
						difficulty,
					})
				);
				onMessage(write_packet(server_packet.connect, { id: 0 }));
			}, 0);
		});

		peer.on("error", () => {
			onMessage(
				write_packet(server_packet.join_reject, {
					cookie: cookieValue,
					reason: RejectionReason.CREATE_GAME_EXISTS,
				})
			);
			onClose();
		});

		peer.on("disconnected", () => {
		});

		peer.on("close", () => {
		});
	};

	void init(cookie);

	return {
		handle,
	};
};

const createWebRTCClient = (
	version: number,
	{ cookie, name, password }: IGameOptions,
	onMessage: MessageHandler,
	onClose: CloseHandler
) => {
	let conn: DataConnection | undefined;
	let pending: (ArrayBuffer | Uint8Array)[] | null = [];
	let myplr: number | undefined;

	const send = (packet: ArrayBuffer | Uint8Array) => {
		if (pending) {
			pending.push(packet);
		} else {
			conn?.send(packet);
		}
	};

	const init = async () => {
		const Peer = await getPeerClass();

		const generateGUID = () =>
			"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
				const random = (Math.random() * 16) | 0;
				const value = char === "x" ? random : (random & 0x3) | 0x8;
				return value.toString(16);
			});

		const guid = generateGUID();
		const peer = new Peer(guid, Options);

		let needUnreg = true;

		const unreg = () => {
			if (!needUnreg) return;
			needUnreg = false;
			peer.off("error", onError);
			peer.off("open", onPeerOpen);
			clearTimeout(timeout);
		};

		const onError = () => {
			onMessage(
				write_packet(server_packet.join_reject, {
					cookie,
					reason: RejectionReason.JOIN_GAME_NOT_FOUND,
				})
			);
			onClose();
			unreg();
		};

		const onOpen = () => {
			conn?.send(write_packet(client_packet.info, { version }));
			conn?.send(
				write_packet(client_packet.join_game, {
					cookie,
					name,
					password,
				})
			);
			for (const pkt of pending ?? []) {
				conn?.send(pkt);
			}
			pending = null;
			conn?.off("open", onOpen);
		};

		const onPeerOpen = () => {
			conn = peer.connect(PeerID(name));

			conn?.on("error", onError);
			conn?.on("open", onOpen);

			conn?.on("iceStateChanged", () => {
				// console.debug(`${timestamp()} WebRTCClient: iceStateChanged:`, e);
			});

			conn?.on("data", (data) => {
				unreg();
				const reader = createBufferReader(data as ArrayBuffer | Uint8Array);
				const { type, packet: pkt } = read_packet(reader, server_packet);
				switch (type.code) {
					case server_packet.join_accept.code:
						myplr = (pkt as { index: number }).index;
						break;
					case server_packet.join_reject.code:
						onClose();
						break;
					case server_packet.disconnect.code:
						if ((pkt as IDisconnectPacket).id === myplr) {
							onClose();
						}
						break;
					default:
				}
				onMessage(data as ArrayBuffer | Uint8Array);
			});

			conn?.on("close", () => {
				onClose();
			});
		};

		const timeout = setTimeout(() => onError(), 20000);
		peer.on("open", onPeerOpen);
		peer.on("error", onError);
	};

	void init();

	return {
		send,
	};
};

const webrtc_open = (onMessage: MessageHandler) => {
	let server: WebRTCServer | null = null,
		client: WebRTCClient | null = null;

	let version = 0;

	return {
		send: function (packet: ArrayBuffer | Uint8Array) {
			const reader = createBufferReader(packet);
			const { type, packet: pkt } = read_packet(reader, client_packet);

			switch (type.code) {
				case client_packet.info.code:
					version = (pkt as IInfoPacket).version;
					break;
				case client_packet.create_game.code:
					if (server || client) {
						onMessage(
							write_packet(server_packet.join_reject, {
								cookie: (pkt as IGameOptions).cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						server = createWebRTCServer(version, pkt as IGameOptions, onMessage, () => {
							server = null;
						});
					}
					break;
				case client_packet.join_game.code:
					if (server || client) {
						onMessage(
							write_packet(server_packet.join_reject, {
								cookie: (pkt as IGameOptions).cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						client = createWebRTCClient(version, pkt as IGameOptions, onMessage, () => {
							client = null;
						});
					}
					break;
				default:
					if (server) {
						server.handle(0, type.code, pkt);
						if (type.code === client_packet.leave_game.code) {
							server = null;
						}
					} else if (client) {
						client.send(packet);
						if (type.code === client_packet.leave_game.code) {
							client = null;
						}
						return;
					} else if (type.code !== client_packet.leave_game.code) {
						throw new Error(`invalid packet ${type.code}`);
					}
			}

			if (!reader.done()) {
				throw new Error("packet too large");
			}
		},
	};
};

export type WebRtcClientOptions = {
	onPacket?: PacketHandler;
	onBatch?: BatchHandler;
	onError?: ErrorHandler;
};

export function createWebRtcClient(opts: WebRtcClientOptions = {}) {
	let instance: ReturnType<typeof webrtc_open> | null = null;
	const packetHandlers = new Set<PacketHandler>();
	const batchHandlers = new Set<BatchHandler>();
	const errorHandlers = new Set<ErrorHandler>();

	if (opts.onPacket) packetHandlers.add(opts.onPacket);
	if (opts.onBatch) batchHandlers.add(opts.onBatch);
	if (opts.onError) errorHandlers.add(opts.onError);

	const start = () => {
		if (instance) return;
		instance = webrtc_open((packet) => {
			for (const handler of packetHandlers) {
				handler(packet);
			}
			for (const handler of batchHandlers) {
				handler([packet]);
			}
		});
	};

	const stop = () => {
		if (!instance) return;
		instance = null;
	};

	const sendPacket = (packet: Packet) => {
		try {
			if (packet instanceof SharedArrayBuffer) {
				instance?.send(new Uint8Array(packet));
			} else {
				instance?.send(packet);
			}
		} catch (error) {
			const normalized = error instanceof Error ? error : new Error("WebRTC send failed");
			for (const handler of errorHandlers) {
				handler(normalized);
			}
		}
	};

	const sendBatch = (packets: PacketBatch) => {
		for (const packet of packets) {
			sendPacket(packet);
		}
	};

	const onPacket = (handler: PacketHandler) => {
		packetHandlers.add(handler);
		return () => packetHandlers.delete(handler);
	};

	const onBatch = (handler: BatchHandler) => {
		batchHandlers.add(handler);
		return () => batchHandlers.delete(handler);
	};

	const onError = (handler: ErrorHandler) => {
		errorHandlers.add(handler);
		return () => errorHandlers.delete(handler);
	};

	return { start, stop, sendPacket, sendBatch, onPacket, onBatch, onError };
}

export default webrtc_open;
