import { explode } from "../../modules/storage/core/explode";
import codec_decode from "../../modules/storage/core/codec";
import type { IPlayerInfo } from "../../types";

type ReadBuffer = (dst: Uint8Array) => number;
type WriteBuffer = (src: Uint8Array) => void;

function pkzip_decompress(data: Uint8Array, out_size: number) {
	if (data.length === out_size) {
		return data;
	}

	const output = new Uint8Array(out_size);
	let in_pos = 0;
	let out_pos = 0;

	const read_buf: ReadBuffer = (dst) => {
		const count = Math.min(data.length - in_pos, dst.length);
		dst.set(data.subarray(in_pos, count));
		in_pos += count;
		return count;
	};

	const write_buf: WriteBuffer = (src) => {
		if (out_pos + src.length > out_size) {
			throw Error("decompress buffer overflow");
		}
		output.set(src, out_pos);
		out_pos += src.length;
	};

	if (explode(read_buf, write_buf) || out_pos !== out_size) {
		return null;
	}

	return output;
}

const hashtable = (function () {
	const hashtable = new Uint32Array(1280);
	let seed = 0x00100001;
	for (let i = 0; i < 256; i++) {
		for (let j = i; j < 1280; j += 256) {
			seed = (seed * 125 + 3) % 0x2aaaab;
			const a = (seed & 0xffff) << 16;
			seed = (seed * 125 + 3) % 0x2aaaab;
			const b = seed & 0xffff;
			hashtable[j] = a | b;
		}
	}
	return hashtable;
})();

export function decrypt(u32: Uint32Array, key: number) {
	let seed = 0xeeeeeeee;
	for (let i = 0; i < u32.length; ++i) {
		seed += hashtable[0x400 + (key & 0xff)];
		u32[i] ^= seed + key;
		seed = (u32[i] + seed * 33 + 3) | 0;
		key = ((~key << 0x15) + 0x11111111) | (key >>> 0x0b);
	}
}

export function decrypt8(u8: Uint8Array, key: number) {
	decrypt(new Uint32Array(u8.buffer, u8.byteOffset, u8.length >> 2), key);
}

export function encrypt(u32: Uint32Array, key: number) {
	let seed = 0xeeeeeeee;
	for (let i = 0; i < u32.length; ++i) {
		seed += hashtable[0x400 + (key & 0xff)];
		const orig = u32[i];
		u32[i] ^= seed + key;
		seed = (orig + seed * 33 + 3) | 0;
		key = ((~key << 0x15) + 0x11111111) | (key >>> 0x0b);
	}
}

export function encrypt8(u8: Uint8Array, key: number) {
	encrypt(new Uint32Array(u8.buffer, u8.byteOffset, u8.length >> 2), key);
}

export function hash(name: string, type: number) {
	let seed1 = 0x7fed7fed;
	let seed2 = 0xeeeeeeee;
	for (let i = 0; i < name.length; ++i) {
		let ch = name.charCodeAt(i);
		if (ch >= 0x61 && ch <= 0x7a) {
			ch -= 0x20;
		}
		if (ch === 0x2f) {
			ch = 0x5c;
		}
		seed1 = hashtable[type * 256 + ch] ^ (seed1 + seed2);
		seed2 = (ch + seed1 + seed2 * 33 + 3) | 0;
	}
	return seed1 >>> 0;
}

export function path_name(name: string) {
	const pos = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
	return name.substring(pos + 1);
}

interface Flags {
	CompressPkWare: number;
	CompressMulti: number;
	Compressed: number;
	Encrypted: number;
	FixSeed: number;
	PatchFile: number;
	SingleUnit: number;
	DummyFile: number;
	SectorCrc: number;
	Exists: number;
}

const Flags: Flags = {
	CompressPkWare: 0x00000100,
	CompressMulti: 0x00000200,
	Compressed: 0x0000ff00,
	Encrypted: 0x00010000,
	FixSeed: 0x00020000,
	PatchFile: 0x00100000,
	SingleUnit: 0x01000000,
	DummyFile: 0x02000000,
	SectorCrc: 0x04000000,
	Exists: 0x80000000,
};

interface FileInfo {
	filePos: number;
	cmpSize: number;
	fileSize: number;
	flags: number;
	key: number;
}

export const createMpqReader = (buffer: ArrayBuffer) => {
	const u8 = new Uint8Array(buffer);
	const u32 = new Uint32Array(buffer, 0, buffer.byteLength >> 2);
	let hashTable: Uint32Array;
	let blockTable: Uint32Array;
	let blockSize = 0;

	const readTable = (offset: number, count: number, key: string) => {
		const tableBuffer = new Uint32Array(buffer.slice(offset, offset + count * 16));
		decrypt(tableBuffer, hash(key, 3));
		return tableBuffer;
	};

	const readHeader = () => {
		if (u32[0] !== 0x1a51504d) {
			throw Error("invalid MPQ header");
		}
		const sizeId = u8[14] + (u8[15] << 8);
		const hashOffset = u32[4];
		const blockOffset = u32[5];
		const hashCount = u32[6];
		const blockCount = u32[7];
		hashTable = readTable(hashOffset, hashCount, "(hash table)");
		blockTable = readTable(blockOffset, blockCount, "(block table)");
		blockSize = 1 << (9 + sizeId);
	};

	const fileIndex = (name: string) => {
		const length = hashTable.length >> 2;
		const index = hash(name, 0) % length;
		const keyA = hash(name, 1);
		const keyB = hash(name, 2);
		for (
			let i = index, count = 0;
			hashTable[i * 4 + 3] !== 0xffffffff && count < length;
			i = (i + 1) % length, ++count
		) {
			if (hashTable[i * 4] === keyA && hashTable[i * 4 + 1] === keyB && hashTable[i * 4 + 3] !== 0xfffffffe) {
				return i;
			}
		}
	};

	const readRaw = (name: string) => {
		const index = fileIndex(name);
		if (index == null) {
			return;
		}
		const block = hashTable[index * 4 + 3];
		const info: FileInfo = {
			filePos: blockTable[block * 4],
			cmpSize: blockTable[block * 4 + 1],
			fileSize: blockTable[block * 4 + 2],
			flags: blockTable[block * 4 + 3],
			key: hash(path_name(name), 3),
		};
		if (info.flags & Flags.PatchFile || info.filePos + info.cmpSize > buffer.byteLength) {
			return;
		}
		if (!(info.flags & Flags.Compressed)) {
			info.cmpSize = info.fileSize;
		}
		if (info.flags & Flags.FixSeed) {
			info.key = (info.key + info.filePos) ^ info.fileSize;
		}
		return {
			info,
			data: new Uint8Array(buffer, info.filePos, info.cmpSize),
		};
	};

	const read = (name: string) => {
		const raw = readRaw(name);
		if (!raw) {
			return;
		}
		const { info } = raw;
		const data = raw.data.slice();

		if (info.flags & Flags.SingleUnit) {
			if (info.flags & Flags.Encrypted) {
				decrypt8(data, info.key);
			}
			if (info.flags & Flags.CompressMulti) {
				return;
			} else if (info.flags & Flags.CompressPkWare) {
				return pkzip_decompress(data, info.fileSize);
			}
			return data;
		}

		if (!(info.flags & Flags.Compressed)) {
			if (info.flags & Flags.Encrypted) {
				for (let i = 0; i < info.fileSize; i += blockSize) {
					decrypt8(data.subarray(i, Math.min(info.fileSize, i + blockSize)), info.key + i / blockSize);
				}
			}
			return data;
		}

		const numBlocks = Math.floor((info.fileSize + blockSize - 1) / blockSize);
		const tableSize = numBlocks + 1;
		if (data.length < tableSize * 4) {
			return;
		}
		const blocks = new Uint32Array(data.buffer, 0, tableSize);
		if (info.flags & Flags.Encrypted) {
			decrypt(blocks, info.key - 1);
		}
		const output = new Uint8Array(info.fileSize);
		for (let i = 0; i < numBlocks; ++i) {
			const oPos = i * blockSize;
			const uSize = Math.min(blockSize, info.fileSize - oPos);
			if (blocks[i + 1] > data.length) {
				return;
			}
			let tmp: Uint8Array | null = data.subarray(blocks[i], blocks[i + 1]);
			if (info.flags & Flags.Encrypted) {
				// this is not safe, but our files are small enough
				decrypt8(tmp, info.key + i);
			}
			if (info.flags & Flags.CompressMulti) {
				return;
			} else if (info.flags & Flags.CompressPkWare) {
				tmp = pkzip_decompress(tmp, uSize);
			}
			if (!tmp || tmp.length !== uSize) {
				return;
			}
			output.set(tmp, oPos);
		}
		return output;
	};

	readHeader();

	return { readRaw, read };
};

export type MpqReader = ReturnType<typeof createMpqReader>;

function getPassword(name: string) {
	if (name.match(/spawn\\d+\\.sv/i)) {
		return "lshbkfg1"; // single, spawn
	} else if (name.match(/share_\\d+\\.sv/i)) {
		return "lshbkfg1"; // multi, spawn
	} else if (name.match(/multi_\\d+\\.sv/i)) {
		return "szqnlsk1"; // multi, retail
	} else {
		return "xrgyrkj1"; // single, retail
	}
}

export default function getPlayerName(data: ArrayBuffer, name: string) {
	try {
		const reader = createMpqReader(data);
		const hero = codec_decode(reader.read("hero")!, getPassword(name));
		const nameEnd = hero?.indexOf(0, 16);
		const result: IPlayerInfo = {
			name: String.fromCharCode(...hero!.subarray(16, nameEnd)),
			cls: hero![48],
			level: hero![53],
		};
		return result;
	} catch {
		return null;
	}
}
