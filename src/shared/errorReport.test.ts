import { describe, expect, it } from "vitest";
import { formatErrorReportBody, buildErrorReportUrl } from "./errorReport";

describe("error report", () => {
	it("includes compression context without asking for a save or inventing Shareware mode", () => {
		const body = formatErrorReportBody({
			message: "failed",
			stack: "worker trace",
			appVersion: "1.6.9",
			userAgent: "browser",
			diagnostics: {
				operation: "MPQ compression",
				stage: "Compressing MPQ entries",
				file: { name: "DIABDAT.MPQ", size: 517501258 },
				buildId: "abc123",
			},
		});
		expect(body).toContain("Compressing MPQ entries");
		expect(body).toContain("517501258");
		expect(body).toContain("abc123");
		expect(body).toContain("worker trace");
		expect(body).toContain("Not applicable");
		expect(body).not.toContain("(Shareware)");
		expect(
			new URL(buildErrorReportUrl("https://github.com/example/repo/issues/new", body)).searchParams.get("body")
		).toBe(body);
	});
});
