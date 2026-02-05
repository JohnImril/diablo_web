import type {
	IConnectPacket,
	IDisconnectPacket,
	IEmptyPacket,
	IGameOptions,
	IInfoPacket,
	IJoinAcceptPacket,
	IJoinPacket,
	IMessagePacket,
	ITurnPacket,
} from "types";

type BasePayload =
	| IInfoPacket
	| GameListPacket
	| IJoinAcceptPacket
	| IJoinPacket
	| IConnectPacket
	| IDisconnectPacket
	| IMessagePacket
	| ITurnPacket
	| IGameOptions
	| IEmptyPacket;

type PacketPayload = BasePayload | PacketBatch;
type PacketBatchEntry = { type: PacketSpec<PacketPayload>; packet: PacketPayload };
type PacketBatch = PacketBatchEntry[];

interface PacketSpec<Payload extends PacketPayload> {
	code: number;
	read: (reader: buffer_reader) => Payload;
	size: number | ((packet: Payload) => number);
	write: (writer: buffer_writer, packet: Payload) => buffer_writer;
}

export interface buffer_reader {
	done: () => boolean;
	read8: () => number;
	read16: () => number;
	read32: () => number;
	read_str: () => string;
	read_buf: () => Uint8Array;
}

export interface buffer_writer {
	readonly result: ArrayBuffer;
	write8: (value: number) => buffer_writer;
	write16: (value: number) => buffer_writer;
	write32: (value: number) => buffer_writer;
	write_str: (value: string) => buffer_writer;
	write_buf: (value: Uint8Array) => buffer_writer;
}

export const createBufferReader = (buffer: ArrayBuffer | Uint8Array): buffer_reader => {
	const arr = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let pos = 0;

	const read8 = () => {
		if (pos >= arr.byteLength) {
			throw new Error("packet too small");
		}
		const value = arr[pos];
		pos += 1;
		return value;
	};

	const read16 = () => {
		if (pos + 2 > arr.byteLength) {
			throw new Error("packet too small");
		}
		const result = arr[pos] | (arr[pos + 1] << 8);
		pos += 2;
		return result;
	};

	const read32 = () => {
		if (pos + 4 > arr.byteLength) {
			throw new Error("packet too small");
		}
		const result = arr[pos] | (arr[pos + 1] << 8) | (arr[pos + 2] << 16) | (arr[pos + 3] << 24);
		pos += 4;
		return result;
	};

	const read_str = () => {
		const length = read8();
		if (pos + length > arr.byteLength) {
			throw new Error("packet too small");
		}
		const result = String.fromCharCode(...arr.subarray(pos, pos + length));
		pos += length;
		return result;
	};

	const read_buf = () => {
		const size = read32();
		const result = arr.subarray(pos, pos + size);
		pos += size;
		return result;
	};

	return {
		done: () => pos === arr.byteLength,
		read8,
		read16,
		read32,
		read_str,
		read_buf,
	};
};

export const createBufferWriter = (length: number): buffer_writer => {
	const buffer = new Uint8Array(length);
	let pos = 0;

	const writer: buffer_writer = {
		get result() {
			return buffer.buffer;
		},
		write8: (value: number) => {
			buffer[pos] = value;
			pos += 1;
			return writer;
		},
		write16: (value: number) => {
			buffer[pos] = value;
			buffer[pos + 1] = value >> 8;
			pos += 2;
			return writer;
		},
		write32: (value: number) => {
			buffer[pos] = value;
			buffer[pos + 1] = value >> 8;
			buffer[pos + 2] = value >> 16;
			buffer[pos + 3] = value >> 24;
			pos += 4;
			return writer;
		},
		write_str: (value: string) => {
			writer.write8(value.length);
			for (let i = 0; i < value.length; ++i) {
				buffer[pos + i] = value.charCodeAt(i);
			}
			pos += value.length;
			return writer;
		},
		write_buf: (value: Uint8Array) => {
			writer.write32(value.byteLength);
			buffer.set(value, pos);
			pos += value.byteLength;
			return writer;
		},
	};

	return writer;
};

export const RejectionReason = {
	JOIN_SUCCESS: 0x00,
	JOIN_ALREADY_IN_GAME: 0x01,
	JOIN_GAME_NOT_FOUND: 0x02,
	JOIN_INCORRECT_PASSWORD: 0x03,
	JOIN_VERSION_MISMATCH: 0x04,
	JOIN_GAME_FULL: 0x05,
	CREATE_GAME_EXISTS: 0x06,
};

export function packet_size<Payload extends PacketPayload>(type: PacketSpec<Payload>, packet: Payload) {
	return (typeof type.size === "function" ? type.size(packet) : type.size) + 1;
}

export function write_packet<Payload extends PacketPayload>(type: PacketSpec<Payload>, packet: Payload) {
	const size = packet_size(type, packet);
	return type.write(createBufferWriter(size).write8(type.code), packet).result;
}

export function read_packet<TPayload extends PacketPayload, TMap extends Record<string, PacketSpec<TPayload>>>(
	reader: buffer_reader,
	types: TMap
): { type: TMap[keyof TMap]; packet: TPayload } {
	const code = reader.read8();
	const packetType = Object.values(types).find((cls) => cls.code === code);
	if (!packetType) throw new Error("invalid packet code");
	const typed = packetType as TMap[keyof TMap];
	return { type: typed, packet: typed.read(reader) };
}

export function make_batch<TMap extends Record<string, PacketSpec<PacketPayload>>>(
	types: () => TMap
): PacketSpec<PacketPayload> {
	return {
		code: 0x00,
		read: (reader: buffer_reader) => {
			const count = reader.read16();
			const packets: PacketBatch = [];
			for (let i = 0; i < count; ++i) {
				packets.push(read_packet(reader, types()) as PacketBatchEntry);
			}
			return packets as PacketPayload;
		},
		size: (packets) =>
			(packets as PacketBatch).reduce((sum, { type, packet }) => sum + packet_size(type, packet), 2),
		write: (writer: buffer_writer, packets) => {
			const list = packets as PacketBatch;
			writer.write16(list.length);
			list.forEach(({ type, packet }) => type.write(writer.write8(type.code), packet));
			return writer;
		},
	};
}

type ServerPacketMap = {
	info: PacketSpec<PacketPayload>;
	game_list: PacketSpec<PacketPayload>;
	join_accept: PacketSpec<PacketPayload>;
	join_reject: PacketSpec<PacketPayload>;
	connect: PacketSpec<PacketPayload>;
	disconnect: PacketSpec<PacketPayload>;
	message: PacketSpec<PacketPayload>;
	turn: PacketSpec<PacketPayload>;
	batch: PacketSpec<PacketPayload>;
};

export const server_packet: ServerPacketMap = (() => {
	const map = {
		info: {
			code: 0x32,
			read: (reader: buffer_reader) => ({ version: reader.read32() } as IInfoPacket),
			size: 4,
			write: (writer: buffer_writer, packet: PacketPayload) =>
				writer.write32((packet as IInfoPacket).version),
		},

		game_list: {
			code: 0x21,
			read: (reader: buffer_reader) => {
				const count = reader.read16();
				const games: Game[] = [];
				for (let i = 0; i < count; ++i) {
					games.push({ type: reader.read32(), name: reader.read_str() });
				}
				return { games };
			},
			size: (packet: PacketPayload) =>
				(packet as GameListPacket).games.reduce((sum, { name }) => sum + 5 + name.length, 2),
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const { games } = packet as GameListPacket;
				writer.write16(games.length);
				for (const { type, name } of games) {
					writer.write32(type);
					writer.write_str(name);
				}
				return writer;
			},
		},

		join_accept: {
			code: 0x12,
			read: (reader: buffer_reader) => ({
				cookie: reader.read32(),
				index: reader.read8(),
				seed: reader.read32(),
				difficulty: reader.read32(),
			}),
			size: 13,
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const join = packet as IJoinAcceptPacket;
				const difficulty = join.difficulty ?? 0;
				return writer.write32(join.cookie).write8(join.index).write32(join.seed).write32(difficulty);
			},
		},

		join_reject: {
			code: 0x15,
			read: (reader: buffer_reader) => ({ cookie: reader.read32(), reason: reader.read8() }),
			size: 5,
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const join = packet as IJoinPacket;
				return writer.write32(join.cookie).write8(join.reason);
			},
		},

		connect: {
			code: 0x13,
			read: (reader: buffer_reader) => ({ id: reader.read8() }),
			size: 1,
			write: (writer: buffer_writer, packet: PacketPayload) => writer.write8((packet as IConnectPacket).id),
		},

		disconnect: {
			code: 0x14,
			read: (reader: buffer_reader) => ({ id: reader.read8(), reason: reader.read32() }),
			size: 5,
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const disconnect = packet as IDisconnectPacket;
				return writer.write8(disconnect.id).write32(disconnect.reason);
			},
		},

		message: {
			code: 0x01,
			read: (reader: buffer_reader) => ({ id: reader.read8(), payload: reader.read_buf() }),
			size: (packet: PacketPayload) => 5 + (packet as IMessagePacket).payload.byteLength,
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const message = packet as IMessagePacket;
				return writer.write8(message.id).write_buf(message.payload);
			},
		},

		turn: {
			code: 0x02,
			read: (reader: buffer_reader) => ({ id: reader.read8(), turn: reader.read32() }),
			size: 5,
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const turn = packet as ITurnPacket;
				return writer.write8(turn.id).write32(turn.turn);
			},
		},
	} satisfies Omit<ServerPacketMap, "batch">;

	const batchSpec: PacketSpec<PacketPayload> = make_batch(() => ({
		...map,
		batch: batchSpec,
	}));

	return { ...map, batch: batchSpec };
})();

type ClientPacketMap = {
	info: PacketSpec<PacketPayload>;
	game_list: PacketSpec<PacketPayload>;
	create_game: PacketSpec<PacketPayload>;
	join_game: PacketSpec<PacketPayload>;
	leave_game: PacketSpec<PacketPayload>;
	drop_player: PacketSpec<PacketPayload>;
	message: PacketSpec<PacketPayload>;
	turn: PacketSpec<PacketPayload>;
	batch: PacketSpec<PacketPayload>;
};

export const client_packet: ClientPacketMap = (() => {
	const map = {
		info: {
			code: 0x31,
			read: (reader: buffer_reader) => ({ version: reader.read32() } as IInfoPacket),
			size: 4,
			write: (writer: buffer_writer, packet: PacketPayload) => writer.write32((packet as IInfoPacket).version),
		},

		game_list: {
			code: 0x21,
			read: () => ({}),
			size: 0,
			write: (writer: buffer_writer) => writer,
		},

		create_game: {
			code: 0x22,
			read: (reader: buffer_reader) => ({
				cookie: reader.read32(),
				name: reader.read_str(),
				password: reader.read_str(),
				difficulty: reader.read32(),
			}),
			size: (packet: PacketPayload) => {
				const game = packet as IGameOptions;
				return 10 + game.name.length + game.password.length;
			},
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const game = packet as IGameOptions;
				return writer.write32(game.cookie).write_str(game.name).write_str(game.password).write32(game.difficulty!);
			},
		},

		join_game: {
			code: 0x23,
			read: (reader: buffer_reader) => ({
				cookie: reader.read32(),
				name: reader.read_str(),
				password: reader.read_str(),
			}),
			size: (packet: PacketPayload) => {
				const join = packet as IGameOptions;
				return 6 + join.name.length + join.password.length;
			},
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const join = packet as IGameOptions;
				return writer.write32(join.cookie).write_str(join.name).write_str(join.password);
			},
		},

		leave_game: {
			code: 0x24,
			read: () => ({}),
			size: 0,
			write: (writer: buffer_writer) => writer,
		},

		drop_player: {
			code: 0x03,
			read: (reader: buffer_reader) => ({ id: reader.read8(), reason: reader.read32() }),
			size: 5,
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const disconnect = packet as IDisconnectPacket;
				return writer.write8(disconnect.id).write32(disconnect.reason);
			},
		},

		message: {
			code: 0x01,
			read: (reader: buffer_reader) => ({ id: reader.read8(), payload: reader.read_buf() }),
			size: (packet: PacketPayload) => 5 + (packet as IMessagePacket).payload.byteLength,
			write: (writer: buffer_writer, packet: PacketPayload) => {
				const message = packet as IMessagePacket;
				return writer.write8(message.id).write_buf(message.payload);
			},
		},

		turn: {
			code: 0x02,
			read: (reader: buffer_reader) => ({ turn: reader.read32() } as ITurnPacket),
			size: 4,
			write: (writer: buffer_writer, packet: PacketPayload) =>
				writer.write32((packet as ITurnPacket).turn),
		},
	} satisfies Omit<ClientPacketMap, "batch">;

	const batchSpec: PacketSpec<PacketPayload> = make_batch(() => ({
		...map,
		batch: batchSpec,
	}));

	return { ...map, batch: batchSpec };
})();

interface Game {
	type: number;
	name: string;
}

interface GameListPacket {
	games: Game[];
}
