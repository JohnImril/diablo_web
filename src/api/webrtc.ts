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

		console.info(`${timestamp()} WebRTCServer: Created peer with ID: ${this.peer.id}`);

		this.peer.on("connection", (conn) => this.onConnect(conn));
		this.players = [];
		this.myplr = 0;

		this.seed = Math.floor(Math.random() * Math.pow(2, 32));
		console.debug(`${timestamp()} WebRTCServer: Generated seed: ${this.seed}`);

		this.peer.on("open", () => {
			console.info(`${timestamp()} WebRTCServer: Peer opened successfully with ID: ${this.peer.id}`);
			setTimeout(() => {
				console.debug(`${timestamp()} WebRTCServer: Sending join_accept and connect packets`);
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

		this.peer.on("error", (err) => {
			console.error(`${timestamp()} WebRTCServer: Peer error occurred`, err);
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
		console.info(`${timestamp()} WebRTCServer: New connection from peer: ${conn.peer}`);
		const peer: PeerData = { conn };
		conn.on("data", (packet) => {
			console.debug(`${timestamp()} WebRTCServer: Received data from peer: ${conn.peer}`);
			const reader = new buffer_reader(packet as ArrayBuffer | Uint8Array);
			const { type, packet: pkt } = read_packet(reader, client_packet);
			console.debug(`${timestamp()} WebRTCServer: Packet type: ${type.code}, Packet content:`, pkt);
			switch (type.code) {
				case client_packet.info.code:
					peer.version = pkt.version;
					console.info(`${timestamp()} WebRTCServer: Peer version set to ${peer.version}`);
					break;
				case client_packet.join_game.code:
					console.info(`${timestamp()} WebRTCServer: Peer is attempting to join game`);
					if (peer.version !== this.version) {
						console.warn(`${timestamp()} WebRTCServer: Version mismatch`);
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: pkt.cookie,
								reason: RejectionReason.JOIN_VERSION_MISMATCH,
							})
						);
					} else if (pkt.name !== this.name) {
						console.warn(`${timestamp()} WebRTCServer: Game name mismatch`);
						conn.send(
							write_packet(server_packet.join_reject, {
								cookie: pkt.cookie,
								reason: RejectionReason.JOIN_GAME_NOT_FOUND,
							})
						);
					} else if (pkt.password !== this.password) {
						console.warn(`${timestamp()} WebRTCServer: Incorrect password`);
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
							console.warn(`${timestamp()} WebRTCServer: Game is full`);
							conn.send(
								write_packet(server_packet.join_reject, {
									cookie: pkt.cookie,
									reason: RejectionReason.JOIN_GAME_FULL,
								})
							);
						} else {
							console.info(`${timestamp()} WebRTCServer: Peer accepted, assigned id: ${i}`);
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
						console.debug(`${timestamp()} WebRTCServer: Handling packet from peer`);
						this.handle(peer.id, type.code, pkt);
					} else {
						console.warn(`${timestamp()} WebRTCServer: Received data from unknown peer`);
						return;
					}
			}
			if (!reader.done()) {
				throw Error("packet too large");
			}
		});
		conn.on("close", () => {
			console.info(`${timestamp()} WebRTCServer: Connection closed from peer: ${conn.peer}`);
			if (peer.id != null) {
				this.drop(peer.id, 0x40000006);
			}
		});
	}

	send(mask: number, pkt: ArrayBuffer | Uint8Array) {
		console.debug(`${timestamp()} WebRTCServer: Sending packet with mask: ${mask}`);
		for (let i = 1; i < MAX_PLRS; ++i) {
			if (mask & (1 << i) && this.players[i]) {
				console.debug(`${timestamp()} WebRTCServer: Sending to player ${i}`);
				this.players[i].conn?.send(pkt);
			}
		}
		if (mask & 1) {
			console.debug(`${timestamp()} WebRTCServer: Sending to local player`);
			this.onMessage(pkt);
		}
	}

	drop(id: number, reason: number) {
		console.info(`${timestamp()} WebRTCServer: Dropping player ${id}, Reason: ${reason}`);
		if (id === 0) {
			console.info(`${timestamp()} WebRTCServer: Dropping all players and closing server`);
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
		console.debug(`${timestamp()} WebRTCServer: Handling packet from player ${id}, Code: ${code}, Packet:`, pkt);
		switch (code) {
			case client_packet.leave_game.code:
				console.info(`${timestamp()} WebRTCServer: Player ${id} is leaving the game`);
				this.drop(id, 3);
				break;
			case client_packet.drop_player.code:
				console.info(
					`${timestamp()} WebRTCServer: Player ${id} requested to drop player ${(pkt as IDisconnectPacket).id}`
				);
				this.drop((pkt as IDisconnectPacket).id, (pkt as IDisconnectPacket).reason);
				break;
			case client_packet.message.code:
				console.debug(`${timestamp()} WebRTCServer: Message from player ${id}`);
				this.send(
					(pkt as IMessagePacket).id === 0xff ? ~(1 << id) : 1 << (pkt as IMessagePacket).id,
					write_packet(server_packet.message, {
						id,
						payload: (pkt as IMessagePacket).payload,
					})
				);
				break;
			case client_packet.turn.code:
				console.debug(`${timestamp()} WebRTCServer: Turn update from player ${id}`);
				this.send(
					~(1 << id),
					write_packet(server_packet.turn, {
						id,
						turn: (pkt as ITurnPacket).turn,
					})
				);
				break;
			default:
				console.error(`${timestamp()} WebRTCServer: Invalid packet code ${code}`);
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
		console.info(`${timestamp()} WebRTCClient: Generated GUID: ${guid}`);

		this.peer = new Peer(guid, Options);
		console.info(`${timestamp()} WebRTCClient: Created peer with ID: ${this.peer.id}`);

		let needUnreg = true;

		const unreg = () => {
			if (!needUnreg) return;
			needUnreg = false;
			console.info(`${timestamp()} WebRTCClient: Unregistering event handlers`);
			this.peer.off("error", onError);
			this.peer.off("open", onPeerOpen);
			clearTimeout(timeout);
		};

		const onError = (err: any) => {
			console.error(`${timestamp()} WebRTCClient: Error occurred`, err);
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
			console.info(`${timestamp()} WebRTCClient: Connection opened`);
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

		const onPeerOpen = (id: string) => {
			console.info(`${timestamp()} WebRTCClient: Peer opened with ID: ${id}`);
			this.conn = this.peer.connect(PeerID(name));
			console.info(`${timestamp()} WebRTCClient: Connecting to server with ID: ${PeerID(name)}`);

			this.conn.on("error", onError);
			this.conn.on("open", onOpen);

			this.conn.on("iceStateChanged", (e) => {
				console.debug(`${timestamp()} WebRTCClient: iceStateChanged:`, e);
			});

			this.conn.on("data", (data) => {
				console.debug(`${timestamp()} WebRTCClient: Received data from server`);
				unreg();
				const reader = new buffer_reader(data as ArrayBuffer | Uint8Array);
				const { type, packet: pkt } = read_packet(reader, server_packet);
				console.debug(`${timestamp()} WebRTCClient: Packet type: ${type.code}, Packet content:`, pkt);
				switch (type.code) {
					case server_packet.join_accept.code:
						console.info(`${timestamp()} WebRTCClient: Join accepted, my player index is ${pkt.index}`);
						this.myplr = pkt.index;
						break;
					case server_packet.join_reject.code:
						console.warn(`${timestamp()} WebRTCClient: Join rejected, reason: ${pkt.reason}`);
						onClose();
						break;
					case server_packet.disconnect.code:
						console.warn(`${timestamp()} WebRTCClient: Disconnected, id: ${pkt.id}`);
						if (pkt.id === "myplr") {
							onClose();
						}
						break;
					default:
						console.debug(`${timestamp()} WebRTCClient: Received packet of type ${type.code}`);
				}
				onMessage(data as ArrayBuffer | Uint8Array);
			});

			this.conn.on("close", () => {
				console.info(`${timestamp()} WebRTCClient: Connection closed`);
				onClose();
			});
		};

		const timeout = setTimeout(() => onError(new Error("Connection timeout")), 20000);
		this.peer.on("open", onPeerOpen);
		this.peer.on("error", onError);
	}

	send(packet: ArrayBuffer | Uint8Array) {
		if (this.pending) {
			console.debug(`${timestamp()} WebRTCClient: Storing packet in pending queue`);
			this.pending.push(packet);
		} else {
			console.debug(`${timestamp()} WebRTCClient: Sending packet`);
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
			console.debug(`${timestamp()} webrtc_open: Received packet to send`);
			const reader = new buffer_reader(packet);
			const { type, packet: pkt } = read_packet(reader, client_packet);
			console.debug(`${timestamp()} webrtc_open: Packet type: ${type.code}, Packet content:`, pkt);

			switch (type.code) {
				case client_packet.info.code:
					version = pkt.version;
					console.info(`${timestamp()} webrtc_open: Version set to ${version}`);
					break;
				case client_packet.create_game.code:
					console.info(`${timestamp()} webrtc_open: Creating game`);
					if (server || client) {
						console.warn(`${timestamp()} webrtc_open: Already in a game, rejecting`);
						onMessage(
							write_packet(server_packet.join_reject, {
								cookie: (pkt as IJoinPacket).cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						server = new WebRTCServer(version, pkt as IGameOptions, onMessage, () => {
							console.info(`${timestamp()} webrtc_open: Server closed`);
							server = null;
						});
					}
					break;
				case client_packet.join_game.code:
					console.info(`${timestamp()} webrtc_open: Joining game`);
					if (server || client) {
						console.warn(`${timestamp()} webrtc_open: Already in a game, rejecting`);
						onMessage(
							write_packet(server_packet.join_reject, {
								cookie: (pkt as IJoinPacket).cookie,
								reason: RejectionReason.JOIN_ALREADY_IN_GAME,
							})
						);
					} else {
						client = new WebRTCClient(version, pkt as IGameOptions, onMessage, () => {
							console.info(`${timestamp()} webrtc_open: Client closed`);
							client = null;
						});
					}
					break;
				default:
					if (server) {
						console.debug(`${timestamp()} webrtc_open: Forwarding packet to server`);
						server.handle(0, type.code, pkt);
						if (type.code === client_packet.leave_game.code) {
							console.info(`${timestamp()} webrtc_open: Leaving game as server`);
							server = null;
						}
					} else if (client) {
						console.debug(`${timestamp()} webrtc_open: Forwarding packet to client`);
						client.send(packet);
						if (type.code === client_packet.leave_game.code) {
							console.info(`${timestamp()} webrtc_open: Leaving game as client`);
							client = null;
						}
						return;
					} else if (type.code !== client_packet.leave_game.code) {
						console.error(`${timestamp()} webrtc_open: Invalid packet code ${type.code}`);
						throw new Error(`invalid packet ${type.code}`);
					}
			}

			if (!reader.done()) {
				throw new Error("packet too large");
			}
		},
	};
}
