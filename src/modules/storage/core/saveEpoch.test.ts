import { describe, expect, it } from "vitest";
import { shouldResetSaves } from "./saveEpoch";

describe("save epoch reset policy", () => {
	it("preserves saves on repeat deployments", () => {
		expect(shouldResetSaves("42", "42")).toBe(false);
	});
	it("resets only on an explicit forward generation", () => {
		expect(shouldResetSaves(1, "2")).toBe(true);
	});
	it("rejects rollback before deleting saves", () => {
		expect(() => shouldResetSaves("42", "1")).toThrow("older save data epoch");
	});
	it.each(["", "-1", "01", "reset", "1.5"])("rejects invalid epoch %j", (epoch) => {
		expect(() => shouldResetSaves("1", epoch)).toThrow("decimal integer");
	});
	it("compares large generation IDs without losing precision", () => {
		expect(() => shouldResetSaves("9007199254740993", "9007199254740992")).toThrow("older");
	});
});
