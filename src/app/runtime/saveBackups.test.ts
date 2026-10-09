import { describe, expect, it } from "vitest";
import { createSaveBackups } from "./saveBackups";

describe("save backup downloads", () => {
	it("exports only the view bytes of a save", async () => {
		const data = new Uint8Array([9, 1, 2, 9]);
		const [backup] = createSaveBackups(new Map([["single_0.sv", data.subarray(1, 3)]]));
		expect([...new Uint8Array(await backup.blob.arrayBuffer())]).toEqual([1, 2]);
	});
	it("copies in-memory saves without reading persistent storage", async () => {
		const data = new Uint8Array([1, 2, 3]);
		const files = new Map([
			["single_0.sv", data],
			["DIABDAT.MPQ", new Uint8Array([9])],
			["multi_0.SV", new Uint8Array([4])],
		]);
		const backups = createSaveBackups(files);
		data[0] = 99;
		expect(backups.map(({ name }) => name)).toEqual(["multi_0.SV", "single_0.sv"]);
		expect([...new Uint8Array(await backups[1].blob.arrayBuffer())]).toEqual([1, 2, 3]);
	});
	it("returns no links when no saves are available", () => {
		expect(createSaveBackups(new Map())).toEqual([]);
	});
});
