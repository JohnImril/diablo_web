import Peer, { DataConnection, PeerOptions } from "peerjs";
import { buffer_reader, read_packet, write_packet, client_packet, server_packet, RejectionReason } from "./packet";
import { IDisconnectPacket, IGameOptions, IInfoPacket, IJoinPacket, IMessagePacket, ITurnPacket } from "../types";

type MessageHandler = (packet: ArrayBuffer | Uint8Array) => void;
type CloseHandler = () => void;

interface PeerData {
	conn: DataConnection;
	id?: number | null;
	version?: number;
}

const timestamp = () => `[${new Date().toISOString()}]`;

const PeerID = (name: string) => `diabloweb_dDv62yHQrZJP28tBEHL_${name}`;
const Options: PeerOptions = { port: 443, secure: true, debug: 3 };
const MAX_PLRS = 4;

class WebRTCServer {
	version: number;
	name: string;
	password: string;
	difficulty?: number;
	onMessage: MessageHandler;
	onClose: CloseHandler;
	peer: Peer;
	players: PeerData[];
	seed: number;
	myplr: number;

	constructor(
		version: number,
		{ cookie, name, password, difficulty }: IGameOptions,
		onMessage: MessageHandler,
		onClose: CloseHandler
	) {
		this.version = version;
		this.name = name;
		this.password = password;
		this.difficulty = difficulty;
		this.onMessage = onMessage;
		this.onClose = onClose;
		this.peer = new Peer(PeerID(name), Options);

		this.peer.on("connection", (conn) => this.onConnect(conn));
		this.players = [];
		this.myplr = 0;

		this.seed = Math.floor(Math.random() * Math.pow(2, 32));

		this.peer.on("open", () => {
			setTimeout(() => {
				onMessage(
					write_packet(server_packet.join_accept, {
						cookie,
						index: 0,
						seed: this.seed,
						difficulty,
					})
				);
				onMessage(write_packet(server_packet.connect, { id: 0 }));
			}, 0);
		});

		this.peer.on("error", () => {
			onMessage(
				write_packet(server_packet.join_reject, {
					cookie,
					reason: RejectionReason.CREATE_GAME_EXISTS,
				})
			);
			onClose();
		});

		this.peer.on("disconnected", () => {
			console.warn(`${timestamp()} WebRTCServer: Peer disconnected`);
		});

		this.peer.on("close", () => {
			console.warn(`${timestamp()} WebRTCServer: Peer connection closed`);
		});
	}

	onConnect(conn: DataConnection) {
		const peer: PeerData = { conn };
		conn.on("data", (packet) => {
			const reader = new buffer_reader(packet as ArrayBuffer | Uint8Array);
			const { type, packet: pkt } = read_packet(reader, client_packet);
			switch (type.code) {
				case client_packet.info.code:
					peer.version = pkt.version;
					break;
				case client_packet.join_game.code:
					if (peer.version !== this.version) {
						console.warn(`${timestamp()} WebRTCServer: Version mismatch`);
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: pkt.cookie,
								reason: RejectionReason.JOIN_VERSION_MISMATCH,
							})
						);
					} else if (pkt.name !== this.name) {
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: pkt.cookie,
								reason: RejectionReason.JOIN_GAME_NOT_FOUND,
							})
						);
					} else if (pkt.password !== this.password) {
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: pkt.cookie,
								reason: RejectionReason.JOIN_INCORRECT_PASSWORD,
							})
						);
					} else {
						let i = 1;
						while (i < MAX_PLRS && this.players[i]) {
							++i;
						}
						if (i >= MAX_PLRS) {
							conn.send(
								write_packet(server_packet.join_reject, {
									cookie: pkt.cookie,
									reason: RejectionReason.JOIN_GAME_FULL,
								})
							);
						} else {
							this.players[i] = peer;
							peer.id = i;
							conn.send(
								write_packet(server_packet.join_accept, {
									cookie: pkt.cookie,
									index: i,
									seed: this.seed,
									difficulty: this.difficulty,
								})
							);
							this.send(0xff, write_packet(server_packet.connect, { id: i }));
						}
					}
					break;
				default:
					if (peer.id != null) {
						this.handle(peer.id, type.code, pkt);
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
				this.drop(peer.id, 0x40000006);
			}
		});
	}

	send(mask: number, pkt: ArrayBuffer | Uint8Array) {
		for (let i = 1; i < MAX_PLRS; ++i) {
			if (mask & (1 << i) && this.players[i]) {
				this.players[i].conn?.send(pkt);
			}
		}
		if (mask & 1) {
			this.onMessage(pkt);
		}
	}

	drop(id: number, reason: number) {
		if (id === 0) {
			for (let i = 1; i < MAX_PLRS; ++i) {
				this.drop(i, 0x40000006);
			}
			this.onMessage(write_packet(server_packet.disconnect, { id, reason }));
			this.peer.destroy();
			this.onClose();
		} else if (this.players[id]) {
			this.send(0xff, write_packet(server_packet.disconnect, { id, reason }));
			this.players[id].id = null;
			this.players[id].conn?.close();
			this.players[id] = null as unknown as PeerData;
		}
	}

	handle(
		id: number,
		code: number,
		pkt: IDisconnectPacket | IMessagePacket | ITurnPacket | IInfoPacket | IJoinPacket
	) {
		switch (code) {
			case client_packet.leave_game.code:
				this.drop(id, 3);
				break;
			case client_packet.drop_player.code:
				this.drop((pkt as IDisconnectPacket).id, (pkt as IDisconnectPacket).reason);
				break;
			case client_packet.message.code:
				this.send(
					(pkt as IMessagePacket).id === 0xff ? ~(1 << id) : 1 << (pkt as IMessagePacket).id,
					write_packet(server_packet.message, {
						id,
						payload: (pkt as IMessagePacket).payload,
					})
				);
				break;
			case client_packet.turn.code:
				this.send(
					~(1 << id),
					write_packet(server_packet.turn, {
						id,
						turn: (pkt as ITurnPacket).turn,
					})
				);
				break;
			default:
				throw new Error(`invalid packet ${code}`);
		}
	}
}

class WebRTCClient {
	peer: Peer;
	conn: DataConnection | undefined;
	pending: (ArrayBuffer | Uint8Array)[] | null = [];
	myplr?: number;

	constructor(
		version: number,
		{ cookie, name, password }: IGameOptions,
		onMessage: MessageHandler,
		onClose: CloseHandler
	) {
		function generateGUID() {
			return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
				const random = (Math.random() * 16) | 0;
				const value = char === "x" ? random : (random & 0x3) | 0x8;
				return value.toString(16);
			});
		}

		const guid = generateGUID();

		this.peer = new Peer(guid, Options);

		let needUnreg = true;

		const unreg = () => {
			if (!needUnreg) return;
			needUnreg = false;
			this.peer.off("error", onError);
			this.peer.off("open", onPeerOpen);
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
			this.conn?.send(write_packet(client_packet.info, { version }));
			this.conn?.send(
				write_packet(client_packet.join_game, {
					cookie,
					name,
					password,
				})
			);
			for (const pkt of this.pending!) {
				this.conn?.send(pkt);
			}
			this.pending = null;
			this.conn?.off("open", onOpen);
		};

		const onPeerOpen = () => {
			this.conn = this.peer.connect(PeerID(name));

			this.conn.on("error", onError);
			this.conn.on("open", onOpen);

			this.conn.on("iceStateChanged", () => {
				// console.debug(`${timestamp()} WebRTCClient: iceStateChanged:`, e);
			});

			this.conn.on("data", (data) => {
				unreg();
				const reader = new buffer_reader(data as ArrayBuffer | Uint8Array);
				const { type, packet: pkt } = read_packet(reader, server_packet);
				switch (type.code) {
					case server_packet.join_accept.code:
						this.myplr = pkt.index;
						break;
					case server_packet.join_reject.code:
						onClose();
						break;
					case server_packet.disconnect.code:
						if (pkt.id === "myplr") {
							onClose();
						}
						break;
					default:
				}
				onMessage(data as ArrayBuffer | Uint8Array);
			});

			this.conn.on("close", () => {
				onClose();
			});
		};

		const timeout = setTimeout(() => onError(), 20000);
		this.peer.on("open", onPeerOpen);
		this.peer.on("error", onError);
	}

	send(packet: ArrayBuffer | Uint8Array) {
		if (this.pending) {
			this.pending.push(packet);
		} else {
			this.conn?.send(packet);
		}
	}
}

export default function webrtc_open(onMessage: MessageHandler) {
	let server: WebRTCServer | null = null,
		client: WebRTCClient | null = null;

	let version = 0;

	return {
		send: function (packet: ArrayBuffer | Uint8Array) {
			const reader = new buffer_reader(packet);
			const { type, packet: pkt } = read_packet(reader, client_packet);

			switch (type.code) {
				case client_packet.info.code:
					version = pkt.version;
					break;
				case client_packet.create_game.code:
					if (server || client) {
						onMessage(
							write_packet(server_packet.join_reject, {
								cookie: (pkt as IJoinPacket).cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						server = new WebRTCServer(version, pkt as IGameOptions, onMessage, () => {
							server = null;
						});
					}
					break;
				case client_packet.join_game.code:
					if (server || client) {
						onMessage(
							write_packet(server_packet.join_reject, {
								cookie: (pkt as IJoinPacket).cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						client = new WebRTCClient(version, pkt as IGameOptions, onMessage, () => {
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
}
