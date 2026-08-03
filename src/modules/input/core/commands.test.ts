import { describe, expect, it } from "vitest";

import { toEngineKeyCode } from "./commands";

describe("toEngineKeyCode", () => {
	it.each([
		["KeyA", 65],
		["Digit7", 55],
		["Numpad3", 99],
		["F1", 112],
		["F24", 135],
		["ArrowLeft", 37],
		["Enter", 13],
	])("maps %s to the engine virtual-key value", (code, expected) => {
		expect(toEngineKeyCode(code)).toBe(expected);
	});

	it("returns zero for an unknown physical key", () => {
		expect(toEngineKeyCode("Unidentified")).toBe(0);
	});
});
