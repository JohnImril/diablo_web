const W = new Uint32Array(80);

const SHA1CircularShift = (shift: number, value: number) => (value << shift) | (value >> (32 - shift));

const createSHA1 = () => {
	const digest = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
	const digest8 = new Uint8Array(digest.buffer);
	let count = 0;

	const input = (u32: Uint32Array) => {
		count += u32.length * 32;
		for (let i = 0; i < 16; ++i) W[i] = u32[i];
		for (let i = 16; i < 80; ++i) W[i] = W[i - 16] ^ W[i - 14] ^ W[i - 8] ^ W[i - 3];

		let [A, B, C, D, E] = digest;

		for (let i = 0; i < 20; i++) {
			const temp = (SHA1CircularShift(5, A) + ((B & C) | (~B & D)) + E + W[i] + 0x5a827999) | 0;
			[E, D, C, B, A] = [D, C, SHA1CircularShift(30, B), A, temp];
		}

		for (let i = 20; i < 40; i++) {
			const temp = (SHA1CircularShift(5, A) + (B ^ C ^ D) + E + W[i] + 0x6ed9eba1) | 0;
			[E, D, C, B, A] = [D, C, SHA1CircularShift(30, B), A, temp];
		}

		for (let i = 40; i < 60; i++) {
			const temp = (SHA1CircularShift(5, A) + ((B & C) | (B & D) | (C & D)) + E + W[i] + 0x8f1bbcdc) | 0;
			[E, D, C, B, A] = [D, C, SHA1CircularShift(30, B), A, temp];
		}

		for (let i = 60; i < 80; i++) {
			const temp = (SHA1CircularShift(5, A) + (B ^ C ^ D) + E + W[i] + 0xca62c1d6) | 0;
			[E, D, C, B, A] = [D, C, SHA1CircularShift(30, B), A, temp];
		}

		digest[0] += A;
		digest[1] += B;
		digest[2] += C;
		digest[3] += D;
		digest[4] += E;
	};

	const input8 = (u8: Uint8Array) => {
		input(new Uint32Array(u8.buffer, u8.byteOffset, 16));
	};

	return {
		get digest() {
			return digest;
		},
		get digest8() {
			return digest8;
		},
		get count() {
			return count;
		},
		input,
		input8,
	};
};

const createRandom = (initialSeed: number) => {
	let seed = initialSeed;
	const next = () => {
		seed = (((seed * 3) << 16) + ((seed * 67) << 8) + seed * 253 + 2531011) | 0;
		return (seed >> 16) & 0x7fff;
	};
	return { next };
};

function codec_init_key(password: string) {
	const rand = createRandom(0x7058);
	const key = new Uint8Array(136);
	const k32 = new Uint32Array(key.buffer);

	for (let i = 0; i < 136; ++i) key[i] = rand.next();

	const pw = new Uint8Array(64);
	for (let i = 0; i < 64; ++i) pw[i] = password.charCodeAt(i % password.length);

	let sha = createSHA1();
	sha.input8(pw);

	for (let i = 0; i < 34; ++i) k32[i] ^= sha.digest[i % sha.digest.length];

	sha = createSHA1();
	sha.input(k32.subarray(18));

	return sha;
}

export default function codec_decode(data: Uint8Array, password: string) {
	if (data.length <= 8) return;

	const size = data.length - 8;
	if (size % 64 || data[size + 4]) return;

	const last_size = data[size + 5];
	const result_size = size + last_size - 64;
	const result = new Uint8Array(result_size);

	const sha = codec_init_key(password);
	const size32 = size >> 2;
	const data32 = new Uint32Array(data.buffer, data.byteOffset, size32 + 1);
	const buf32 = new Uint32Array(16);
	const buf = new Uint8Array(buf32.buffer);

	for (let i = 0; i < size32; i += 16) {
		for (let j = 0; j < 16; ++j) buf32[j] = data32[i + j] ^ sha.digest[j % sha.digest.length];
		sha.input(buf32);
		result.set(i === size32 - 16 ? buf.subarray(0, last_size) : buf, i * 4);
	}

	return data32[size32] === sha.digest[0] ? result : undefined;
}
