import { describe, expect, it } from "vitest";
import { normalizeError } from "./normalizeError";

describe("normalizeError", () => {
	it("preserves worker message and stack without an Error prototype", () => {
		expect(normalizeError({ message: "compression failed", stack: "worker trace" })).toMatchObject({
			message: "compression failed",
			stack: "worker trace",
		});
	});
	it("retains nested causes and handles circular thrown objects", () => {
		const error = new Error("outer", { cause: new Error("inner") });
		expect(normalizeError(error).details).toContain("inner");
		const object: { excPtr: number; self?: unknown } = { excPtr: 123 };
		object.self = object;
		const result = normalizeError(object);
		expect(result.message).toContain("123");
		expect(result.details).toContain("[Circular]");
		expect(result.message).not.toBe("[object Object]");
	});
});
