import { describe, expect, it } from "vitest";
import { client_packet, createBufferReader, server_packet, write_packet } from "./packetCodec";

describe("packet codec", () => {
	it("round-trips client info packets", () => {
		const encoded = write_packet(client_packet.info, { version: 7 });
		const reader = createBufferReader(encoded);
		expect(reader.read8()).toBe(client_packet.info.code);
		expect(client_packet.info.read(reader)).toEqual({ version: 7 });
		expect(reader.done()).toBe(true);
	});

	it("rejects truncated scalar reads", () => {
		expect(() => createBufferReader(new Uint8Array([1])).read16()).toThrow("packet too small");
	});

	it("round-trips server messages", () => {
		const encoded = write_packet(server_packet.message, { id: 2, payload: new Uint8Array([3, 4]) });
		const reader = createBufferReader(encoded);
		expect(reader.read8()).toBe(server_packet.message.code);
		expect(server_packet.message.read(reader)).toEqual({ id: 2, payload: new Uint8Array([3, 4]) });
	});
});
