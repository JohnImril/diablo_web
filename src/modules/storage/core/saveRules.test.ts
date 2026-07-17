import { describe, expect, it } from "vitest";
import { extractSaveName, isSaveFile, sortSaveNames } from "./saveRules";

describe("save rules", () => {
	it("recognizes save files case-insensitively", () => {
		expect(isSaveFile("hero.sv")).toBe(true);
		expect(isSaveFile("HERO.SV")).toBe(true);
		expect(isSaveFile("hero.txt")).toBe(false);
	});

	it("preserves the input array while sorting names", () => {
		const names = ["z.sv", "a.sv"];
		expect(sortSaveNames(names)).toEqual(["a.sv", "z.sv"]);
		expect(names).toEqual(["z.sv", "a.sv"]);
		expect(extractSaveName("notes.txt")).toBeNull();
	});
});
