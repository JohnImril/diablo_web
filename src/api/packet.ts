import { IGameOptions } from "../types";

export class buffer_reader {
	private buffer: Uint8Array;
	private pos: number;

	constructor(buffer: ArrayBuffer | Uint8Array) {
		this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
		this.pos = 0;
	}

	done(): boolean {
		return this.pos === this.buffer.byteLength;
	}

	read8(): number {
		if (this.pos >= this.buffer.byteLength) {
			throw Error("packet too small");
		}
		return this.buffer[this.pos++];
	}

	read16(): number {
		const { pos, buffer } = this;
		if (pos + 2 > buffer.byteLength) {
			throw Error("packet too small");
		}
		const result = buffer[pos] | (buffer[pos + 1] << 8);
		this.pos += 2;
		return result;
	}

	read32(): number {
		const { pos, buffer } = this;
		if (pos + 4 > buffer.byteLength) {
			throw Error("packet too small");
		}
		const result = buffer[pos] | (buffer[pos + 1] << 8) | (buffer[pos + 2] << 16) | (buffer[pos + 3] << 24);
		this.pos += 4;
		return result;
	}

	read_str(): string {
		const length = this.read8();
		const { pos, buffer } = this;
		if (pos + length > buffer.byteLength) {
			throw Error("packet too small");
		}
		const result = String.fromCharCode(...buffer.subarray(pos, pos + length));
		this.pos += length;
		return result;
	}

	read_buf(): Uint8Array {
		const size = this.read32();
		const result = this.buffer.subarray(this.pos, this.pos + size);
		this.pos += size;
		return result;
	}
}

export class buffer_writer {
	private buffer: Uint8Array;
	private pos: number;

	constructor(length: number) {
		this.buffer = new Uint8Array(length);
		this.pos = 0;
	}

	get result(): ArrayBuffer {
		return this.buffer.buffer;
	}

	write8(value: number): this {
		this.buffer[this.pos++] = value;
		return this;
	}

	write16(value: number): this {
		const { pos, buffer } = this;
		buffer[pos] = value;
		buffer[pos + 1] = value >> 8;
		this.pos += 2;
		return this;
	}

	write32(value: number): this {
		const { pos, buffer } = this;
		buffer[pos] = value;
		buffer[pos + 1] = value >> 8;
		buffer[pos + 2] = value >> 16;
		buffer[pos + 3] = value >> 24;
		this.pos += 4;
		return this;
	}

	write_str(value: string): this {
		const length = value.length;
		this.write8(length);
		const { pos, buffer } = this;
		for (let i = 0; i < length; ++i) {
			buffer[pos + i] = value.charCodeAt(i);
		}
		this.pos += length;
		return this;
	}

	rest(value: Uint8Array): this {
		this.buffer.set(value, this.pos);
		this.pos += value.byteLength;
		return this;
	}

	write_buf(value: Uint8Array): this {
		this.write32(value.byteLength);
		this.rest(value);
		return this;
	}
}

export const RejectionReason = {
	JOIN_SUCCESS: 0x00,
	JOIN_ALREADY_IN_GAME: 0x01,
	JOIN_GAME_NOT_FOUND: 0x02,
	JOIN_INCORRECT_PASSWORD: 0x03,
	JOIN_VERSION_MISMATCH: 0x04,
	JOIN_GAME_FULL: 0x05,
	CREATE_GAME_EXISTS: 0x06,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function read_packet<T extends Record<string, any>>(reader: buffer_reader, types: T) {
	const code = reader.read8();
	const cls = Object.values(types).find((cls) => cls.code === code);
	if (!cls) {
		throw new Error("invalid packet code");
	}
	return { type: cls, packet: cls.read(reader) };
}

export function packet_size<T>(type: { size: number | ((packet: T) => number) }, packet: T) {
	return (typeof type.size === "function" ? type.size(packet) : type.size) + 1;
}

export function write_packet<T>(
	type: {
		code: number;
		size: number | ((packet: T) => number);
		write: (writer: buffer_writer, packet: T) => buffer_writer;
	},
	packet: T
) {
	const size = packet_size(type, packet);
	return type.write(new buffer_writer(size).write8(type.code), packet).result;
}

export function make_batch<T>(
	types: () => Record<
		string,
		{
			code: number;
			read: (reader: buffer_reader) => T;
			size: number | ((packet: T) => number);
			write: (writer: buffer_writer, packet: T) => buffer_writer;
		}
	>
) {
	return {
		code: 0x00,
		read: (reader: buffer_reader) => {
			const count = reader.read16();
			const packets: Array<{ type: PacketType<T>; packet: T }> = [];
			for (let i = 0; i < count; ++i) {
				const packetType = types();
				const packet = read_packet(reader, packetType);
				packets.push(
					packet as {
						type: PacketType<T>;
						packet: T;
					}
				);
			}
			return packets;
		},
		size: (packets: Array<{ type: PacketType<T>; packet: T }>) =>
			packets.reduce((sum, { type, packet }) => sum + packet_size(type, packet), 2),
		write: (writer: buffer_writer, packets: Array<{ type: PacketType<T>; packet: T }>) => {
			writer.write16(packets.length);
			for (const { type, packet } of packets) {
				type.write(writer.write8(type.code), packet);
			}
			return writer;
		},
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const server_packet: any = {
	info: {
		code: 0x32,
		read: (reader: buffer_reader) => ({ version: reader.read32() }),
		size: 4,
		write: (writer: buffer_writer, { version }: InfoPacket) => writer.write32(version),
	},

	game_list: {
		code: 0x21,
		read: (reader: buffer_reader): GameListPacket => {
			const count = reader.read16();
			const games: Game[] = [];
			for (let i = 0; i < count; ++i) {
				games.push({ type: reader.read32(), name: reader.read_str() });
			}
			return { games };
		},
		size: ({ games }: GameListPacket) => games.reduce((sum, { name }) => sum + 5 + name.length, 2),
		write: (writer: buffer_writer, { games }: GameListPacket) => {
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
		write: (
			writer: buffer_writer,
			{
				cookie,
				index,
				seed,
				difficulty,
			}: {
				cookie: number;
				index: number;
				seed: number;
				difficulty: number;
			}
		) => writer.write32(cookie).write8(index).write32(seed).write32(difficulty),
	},

	join_reject: {
		code: 0x15,
		read: (reader: buffer_reader) => ({ cookie: reader.read32(), reason: reader.read8() }),
		size: 5,
		write: (
			writer: buffer_writer,
			{
				cookie,
				reason,
			}: {
				cookie: number;
				reason: number;
			}
		) => writer.write32(cookie).write8(reason),
	},

	connect: {
		code: 0x13,
		read: (reader: buffer_reader) => ({ id: reader.read8() }),
		size: 1,
		write: (writer: buffer_writer, { id }: { id: number }) => writer.write8(id),
	},

	disconnect: {
		code: 0x14,
		read: (reader: buffer_reader) => ({ id: reader.read8(), reason: reader.read32() }),
		size: 5,
		write: (writer: buffer_writer, { id, reason }: DisconnectPacket) => writer.write8(id).write32(reason),
	},

	message: {
		code: 0x01,
		read: (reader: buffer_reader) => ({ id: reader.read8(), payload: reader.read_buf() }),
		size: ({ payload }: MessagePacket) => 5 + payload.byteLength,
		write: (writer: buffer_writer, { id, payload }: MessagePacket) => writer.write8(id).write_buf(payload),
	},

	turn: {
		code: 0x02,
		read: (reader: buffer_reader) => ({ id: reader.read8(), turn: reader.read32() }),
		size: 5,
		write: (writer: buffer_writer, { id, turn }: TurnPacket) => writer.write8(id).write32(turn),
	},

	batch: make_batch(() => server_packet),
};

export const client_packet = {
	info: {
		code: 0x31,
		read: (reader: buffer_reader) => ({ version: reader.read32() }),
		size: 4,
		write: (writer: buffer_writer, { version }: InfoPacket) => writer.write32(version),
	},

	game_list: {
		code: 0x21,
		read: (): Record<string, never> => ({}),
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
		size: ({ name, password }: IGameOptions) => 10 + name.length + password.length,
		write: (writer: buffer_writer, { cookie, name, password, difficulty }: IGameOptions) =>
			writer.write32(cookie).write_str(name).write_str(password).write32(difficulty!),
	},

	join_game: {
		code: 0x23,
		read: (reader: buffer_reader) => ({
			cookie: reader.read32(),
			name: reader.read_str(),
			password: reader.read_str(),
		}),
		size: ({ name, password }: IGameOptions) => 6 + name.length + password.length,
		write: (writer: buffer_writer, { cookie, name, password }: IGameOptions) =>
			writer.write32(cookie).write_str(name).write_str(password),
	},

	leave_game: {
		code: 0x24,
		read: (): Record<string, never> => ({}),
		size: 0,
		write: (writer: buffer_writer) => writer,
	},

	drop_player: {
		code: 0x03,
		read: (reader: buffer_reader) => ({ id: reader.read8(), reason: reader.read32() }),
		size: 5,
		write: (writer: buffer_writer, { id, reason }: DisconnectPacket) => writer.write8(id).write32(reason),
	},

	message: {
		code: 0x01,
		read: (reader: buffer_reader) => ({ id: reader.read8(), payload: reader.read_buf() }),
		size: ({ payload }: MessagePacket) => 5 + payload.byteLength,
		write: (writer: buffer_writer, { id, payload }: MessagePacket) => writer.write8(id).write_buf(payload),
	},

	turn: {
		code: 0x02,
		read: (reader: buffer_reader) => ({ turn: reader.read32() }) as TurnPacket,
		size: 4,
		write: (writer: buffer_writer, { turn }: TurnPacket) => writer.write32(turn),
	},

	batch: make_batch(() => server_packet),
};
interface PacketType<T> {
	code: number;
	read: (reader: buffer_reader) => T;
	size: number | ((packet: T) => number);
	write: (writer: buffer_writer, packet: T) => buffer_writer;
}

interface Game {
	type: number;
	name: string;
}

interface InfoPacket {
	version: number;
}

interface GameListPacket {
	games: Game[];
}

interface DisconnectPacket {
	reason: number;
	id: number;
}

interface MessagePacket {
	id: number;
	payload: Uint8Array;
}

interface TurnPacket {
	id: number;
	turn: number;
}
