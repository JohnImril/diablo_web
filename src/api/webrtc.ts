import Peer, { DataConnection, PeerOptions } from "peerjs";
import { buffer_reader, read_packet, write_packet, client_packet, server_packet, RejectionReason } from "./packet";
import { IDisconnectPacket, IGameOptions, IInfoPacket, IJoinPacket, IMessagePacket, ITurnPacket } from "../types";

/*function log_packet(data, type) {
  const reader = new buffer_reader(data);
  const id = reader.read8();
  for (let [name, {code, read}] of Object.entries(type)) {
    if (code === id && (name !== 'message' && name !== 'turn')) {
      console.log(`${type === client_packet ? 'client_packet' : 'server_packet'}.${name} ${JSON.stringify(read(reader))}`);
    }
  }
}*/

type MessageHandler = (packet: ArrayBuffer | Uint8Array) => void;
type CloseHandler = () => void;

interface PeerData {
	conn: DataConnection;
	id?: number | null;
	version?: number;
}

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

		console.log("WebRTCServer: Created peer with ID:", this.peer.id);

		console.log("server:", PeerID(name));

		this.peer.on("connection", (conn) => this.onConnect(conn));
		this.players = [];
		this.myplr = 0;

		this.seed = Math.floor(Math.random() * Math.pow(2, 32));
		console.log("WebRTCServer: Generated seed:", this.seed);

		const onError = (err: any) => {
			console.error("WebRTCServer: Peer error occurred", err);
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
			console.log("WebRTCServer: Peer opened successfully");
			setTimeout(() => {
				console.log("WebRTCServer: Sending join_accept and connect packets");
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
		console.log("WebRTCServer: New connection from peer:", conn.peer);
		const peer: PeerData = { conn };
		conn.on("data", (packet) => {
			console.log("WebRTCServer: Received data from peer:", conn.peer);
			const reader = new buffer_reader(packet as ArrayBuffer | Uint8Array);
			const { type, packet: pkt } = read_packet(reader, client_packet);
			console.log("WebRTCServer: Packet type:", type.code, "Packet content:", pkt);
			switch (type.code) {
				case client_packet.info.code:
					peer.version = pkt.version;
					console.log("WebRTCServer: Peer version set to", peer.version);
					break;
				case client_packet.join_game.code:
					console.log("WebRTCServer: Peer is attempting to join game");
					if (peer.version !== this.version) {
						console.warn("WebRTCServer: Version mismatch");
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: pkt.cookie,
								reason: RejectionReason.JOIN_VERSION_MISMATCH,
							})
						);
					} else if (pkt.name !== this.name) {
						console.warn("WebRTCServer: Game name mismatch");
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: pkt.cookie,
								reason: RejectionReason.JOIN_GAME_NOT_FOUND,
							})
						);
					} else if (pkt.password !== this.password) {
						console.warn("WebRTCServer: Incorrect password");
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
							console.warn("WebRTCServer: Game is full");
							conn.send(
								write_packet(server_packet.join_reject, {
									cookie: pkt.cookie,
									reason: RejectionReason.JOIN_GAME_FULL,
								})
							);
						} else {
							console.log("WebRTCServer: Peer accepted, assigned id:", i);
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
						console.log("WebRTCServer: Handling packet from peer");
						this.handle(peer.id, type.code, pkt);
					} else {
						console.warn("WebRTCServer: Received data from unknown peer");
						return;
					}
			}
			if (!reader.done()) {
				throw Error("packet too large");
			}
		});
		conn.on("close", () => {
			console.log("WebRTCServer: Connection closed from peer:", conn.peer);
			if (peer.id != null) {
				this.drop(peer.id, 0x40000006);
			}
		});
	}

	send(mask: number, pkt: ArrayBuffer | Uint8Array) {
		console.log("WebRTCServer: Sending packet with mask:", mask);
		for (let i = 1; i < MAX_PLRS; ++i) {
			if (mask & (1 << i) && this.players[i]) {
				console.log("WebRTCServer: Sending to player", i);
				this.players[i].conn?.send(pkt);
			}
		}
		if (mask & 1) {
			console.log("WebRTCServer: Sending to local player");
			this.onMessage(pkt);
		}
	}

	drop(id: number, reason: number) {
		console.log("WebRTCServer: Dropping player", id, "Reason:", reason);
		if (id === 0) {
			console.log("WebRTCServer: Dropping all players and closing server");
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
		console.log("WebRTCServer: Handling packet from player", id, "Code:", code, "Packet:", pkt);
		switch (code) {
			case client_packet.leave_game.code:
				console.log("WebRTCServer: Player", id, "is leaving the game");
				this.drop(id, 3);
				break;
			case client_packet.drop_player.code:
				console.log("WebRTCServer: Player", id, "requested to drop player", (pkt as IDisconnectPacket).id);
				this.drop((pkt as IDisconnectPacket).id, (pkt as IDisconnectPacket).reason);
				break;
			case client_packet.message.code:
				console.log("WebRTCServer: Message from player", id);
				this.send(
					(pkt as IMessagePacket).id === 0xff ? ~(1 << id) : 1 << (pkt as IMessagePacket).id,
					write_packet(server_packet.message, {
						id,
						payload: (pkt as IMessagePacket).payload,
					})
				);
				break;
			case client_packet.turn.code:
				console.log("WebRTCServer: Turn update from player", id);
				this.send(
					~(1 << id),
					write_packet(server_packet.turn, {
						id,
						turn: (pkt as ITurnPacket).turn,
					})
				);
				break;
			default:
				console.error(`WebRTCServer: Invalid packet code ${code}`);
				throw new Error(`invalid packet ${code}`);
		}
	}
}

class WebRTCClient {
	peer: Peer;
	conn: DataConnection;
	pending: (ArrayBuffer | Uint8Array)[] | null = [];
	myplr?: number;

	constructor(
		version: number,
		{ cookie, name, password }: IGameOptions,
		onMessage: MessageHandler,
		onClose: CloseHandler
	) {
		this.peer = new Peer(Options);
		console.log("WebRTCClient: Created peer with ID:", this.peer.id);
		this.conn = this.peer.connect(PeerID(name));
		console.log("WebRTCClient: Connecting to server with ID:", PeerID(name));

		let needUnreg = true;

		const unreg = () => {
			if (!needUnreg) return;
			needUnreg = false;
			console.log("WebRTCClient: Unregistering event handlers");
			this.peer.off("error", onError);
			this.conn.off("error", onError);
			this.conn.off("open", onOpen);
			clearTimeout(timeout);
		};

		const onError = (err: any) => {
			console.error("WebRTCClient: Error occurred", err);
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
			console.log("WebRTCClient: Connection opened");
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
			console.log("WebRTCClient: Received data from server");
			unreg();
			const reader = new buffer_reader(data as ArrayBuffer | Uint8Array);
			const { type, packet: pkt } = read_packet(reader, server_packet);
			console.log("WebRTCClient: Packet type:", type.code, "Packet content:", pkt);
			switch (type.code) {
				case server_packet.join_accept.code:
					console.log("WebRTCClient: Join accepted, my player index is", (pkt as any).index);
					this.myplr = pkt.index;
					break;
				case server_packet.join_reject.code:
					console.warn("WebRTCClient: Join rejected, reason:", (pkt as any).reason);
					onClose();
					break;
				case server_packet.disconnect.code:
					console.warn("WebRTCClient: Disconnected, id:", (pkt as any).id);
					if (pkt.id === "myplr") {
						onClose();
					}
					break;
				default:
					console.log("WebRTCClient: Received packet of type", type.code);
			}
			onMessage(data as ArrayBuffer | Uint8Array);
		});
		this.conn.on("close", () => {
			console.log("WebRTCClient: Connection closed");
			onClose();
		});
	}

	send(packet: ArrayBuffer | Uint8Array) {
		if (this.pending) {
			console.log("WebRTCClient: Storing packet in pending queue");
			this.pending.push(packet);
		} else {
			console.log("WebRTCClient: Sending packet");
			this.conn.send(packet);
		}
	}
}

export default function webrtc_open(onMessage: MessageHandler) {
	let server: WebRTCServer | null = null,
		client: WebRTCClient | null = null;

	let version = 0;

	return {
		send: function (packet: ArrayBuffer | Uint8Array) {
			console.log("webrtc_open: Received packet to send");
			const reader = new buffer_reader(packet);
			const { type, packet: pkt } = read_packet(reader, client_packet);
			console.log("webrtc_open: Packet type:", type.code, "Packet content:", pkt);

			switch (type.code) {
				case client_packet.info.code:
					version = pkt.version;
					console.log("webrtc_open: Version set to", version);
					break;
				case client_packet.create_game.code:
					console.log("webrtc_open: Creating game");
					if (server || client) {
						console.warn("webrtc_open: Already in a game, rejecting");
						onMessage(
							write_packet(server_packet.join_reject, {
								cookie: (pkt as IJoinPacket).cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						server = new WebRTCServer(version, pkt as IGameOptions, onMessage, () => {
							console.log("webrtc_open: Server closed");
							server = null;
						});
					}
					break;
				case client_packet.join_game.code:
					console.log("webrtc_open: Joining game");
					if (server || client) {
						console.warn("webrtc_open: Already in a game, rejecting");
						onMessage(
							write_packet(server_packet.join_reject, {
								cookie: (pkt as IJoinPacket).cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						client = new WebRTCClient(version, pkt as IGameOptions, onMessage, () => {
							console.log("webrtc_open: Client closed");
							client = null;
						});
					}
					break;
				default:
					if (server) {
						console.log("webrtc_open: Forwarding packet to server");
						server.handle(0, type.code, pkt);
						if (type.code === client_packet.leave_game.code) {
							console.log("webrtc_open: Leaving game as server");
							server = null;
						}
					} else if (client) {
						console.log("webrtc_open: Forwarding packet to client");
						client.send(packet);
						if (type.code === client_packet.leave_game.code) {
							console.log("webrtc_open: Leaving game as client");
							client = null;
						}
						return;
					} else if (type.code !== client_packet.leave_game.code) {
						console.error("webrtc_open: Invalid packet code", type.code);
						throw new Error(`invalid packet ${type.code}`);
					}
			}

			if (!reader.done()) {
				throw new Error("packet too large");
			}
		},
	};
}
