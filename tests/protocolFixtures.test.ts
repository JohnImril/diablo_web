import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { client_packet, createBufferReader, server_packet } from "../src/modules/network/core/packetCodec";

type Vector = { name: string; direction: string; hex: string };
const fixture = JSON.parse(
	readFileSync(new URL("../protocol/fixtures/v1.json", import.meta.url), "utf8")
) as { vectors: Vector[] };

describe("hellgate-ws shared protocol fixtures", () => {
	it.each(fixture.vectors)("$name", ({ direction, hex }) => {
		const reader = createBufferReader(Uint8Array.from(Buffer.from(hex, "hex")));
		const code = reader.read8();
		const packetMap = direction === "server-to-client" ? server_packet : client_packet;
		const packet = Object.values(packetMap).find((candidate) => candidate.code === code);
		expect(packet).toBeDefined();
		expect(() => packet?.read(reader)).not.toThrow();
		expect(reader.done()).toBe(true);
	});
});

