import Peer, { DataConnection } from "peerjs";
import { buffer_reader, read_packet, write_packet, client_packet, server_packet, RejectionReason } from "./packet";

/*function log_packet(data, type) {
  const reader = new buffer_reader(data);
  const id = reader.read8();
  for (let [name, {code, read}] of Object.entries(type)) {
    if (code === id && (name !== 'message' && name !== 'turn')) {
      console.log(`${type === client_packet ? 'client_packet' : 'server_packet'}.${name} ${JSON.stringify(read(reader))}`);
    }
  }
}*/

type Packet = ArrayBuffer | Uint8Array;
type MessageHandler = (packet: Packet) => void;
type CloseHandler = () => void;

interface GameOptions {
	cookie: number;
	name: string;
	password: string;
	difficulty: number;
}

interface PeerOptions {
	port: number;
	secure: boolean;
}

interface PeerData {
	conn: DataConnection;
	id?: number;
	version?: number;
}

const PeerID = (name: string): string => `diabloweb_dDv62yHQrZJP28tBEHL_${name}`;
const Options: PeerOptions = { port: 443, secure: true };
const MAX_PLRS = 4;

class webrtc_server {
	version: number;
	name: string;
	password: string;
	difficulty: number;
	onMessage: MessageHandler;
	onClose: CloseHandler;
	peer: Peer;
	players: {
		id?: number | null;
		conn: DataConnection;
	}[] = [];
	seed: number;
	myplr: number;

	constructor(
		version: number,
		{ cookie, name, password, difficulty }: GameOptions,
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

		const onError = () => {
			onMessage(
				write_packet(server_packet.join_reject, {
					cookie,
					reason: RejectionReason.CREATE_GAME_EXISTS,
				})
			);
			onClose();
			this.peer.off("error", onError);
			this.peer.off("open", onOpen);
		};

		const onOpen = () => {
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
			this.peer.off("error", onError);
			this.peer.off("open", onOpen);
		};

		this.peer.on("error", onError);
		this.peer.on("open", onOpen);
	}

	onConnect(conn: DataConnection) {
		const peer: PeerData = { conn };
		conn.on("data", (packet) => {
			const reader = new buffer_reader(packet as Packet);
			const { type, packet: pkt } = read_packet(reader, client_packet);

			switch (type.code) {
				case client_packet.info.code:
					peer.version = pkt.version;
					break;
				case client_packet.join_game.code:
					if (peer.version !== this.version) {
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

	send(mask: number, pkt: Packet) {
		for (let i = 1; i < MAX_PLRS; ++i) {
			if (mask & (1 << i) && this.players[i]) {
				if (this.players[i].conn) {
					this.players[i].conn.send(pkt);
				}
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
			if (this.players[id].conn) {
				this.players[id].conn.close();
			}
			this.players[id] = null as unknown as {
				id?: number | null;
				conn: DataConnection;
			};
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handle(id: number, code: number, pkt: any): void {
		switch (code) {
			case client_packet.leave_game.code:
				this.drop(id, 3);
				break;
			case client_packet.drop_player.code:
				this.drop(pkt.id, pkt.reason);
				break;
			case client_packet.message.code:
				this.send(
					pkt.id === 0xff ? ~(1 << id) : 1 << pkt.id,
					write_packet(server_packet.message, {
						id,
						payload: pkt.payload,
					})
				);
				break;
			case client_packet.turn.code:
				this.send(~(1 << id), write_packet(server_packet.turn, { id, turn: pkt.turn }));
				break;
			default:
				throw Error(`invalid packet ${code}`);
		}
	}
}

class webrtc_client {
	peer: Peer;
	conn: DataConnection;
	pending: Packet[] | null = [];
	myplr: unknown;

	constructor(
		version: number,
		{ cookie, name, password }: GameOptions,
		onMessage: MessageHandler,
		onClose: CloseHandler
	) {
		this.peer = new Peer(Options);
		this.conn = this.peer.connect(PeerID(name));

		let needUnreg = true;

		const unreg = () => {
			if (!needUnreg) return;
			needUnreg = false;
			this.peer.off("error", onError);
			this.conn.off("error", onError);
			this.conn.off("open", onOpen);
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
			this.conn.send(write_packet(client_packet.info, { version }));
			this.conn.send(
				write_packet(client_packet.join_game, {
					cookie,
					name,
					password,
				})
			);
			for (const pkt of this.pending!) {
				this.conn.send(pkt);
			}
			this.pending = null;
			this.conn.off("open", onOpen);
		};

		const timeout = setTimeout(onError, 10000);
		this.peer.on("error", onError);
		this.conn.on("error", onError);
		this.conn.on("open", onOpen);

		this.conn.on("data", (data) => {
			unreg();
			const reader = new buffer_reader(data as Packet);
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
			onMessage(data as Packet);
		});
		this.conn.on("close", () => {
			onClose();
		});
	}

	send(packet: Packet) {
		if (this.pending) {
			this.pending.push(packet);
		} else {
			this.conn.send(packet);
		}
	}
}

export default function webrtc_open(onMessage: MessageHandler) {
	let server: webrtc_server | null = null,
		client: webrtc_client | null = null;

	let version = 0;

	return {
		send: function (packet: Packet) {
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
								cookie: pkt.cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						server = new webrtc_server(version, pkt, onMessage, () => (server = null));
					}
					break;
				case client_packet.join_game.code:
					if (server || client) {
						onMessage(
							write_packet(server_packet.join_reject, {
								cookie: pkt.cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						client = new webrtc_client(version, pkt, onMessage, () => (client = null));
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
						throw Error(`invalid packet ${type.code}`);
					}
			}
			if (!reader.done()) {
				throw Error("packet too large");
			}
		},
	};
}
