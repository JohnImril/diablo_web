import { describe, expect, it } from "vitest";
import {
	formatErrorReportBody,
	buildErrorReportUrl,
	formatErrorReportTitle,
	MAX_ERROR_REPORT_URL_LENGTH,
	REPORT_ATTACHMENT_NOTICE,
} from "./errorReport";

describe("error report", () => {
	it("encodes spaces explicitly while preserving literal plus signs", () => {
		const body = "Steps to reproduce:\n    C++ failed + details";
		const title = "DiabloWeb: Opening save storage";
		const url = buildErrorReportUrl("https://github.com/example/repo/issues/new", body, title);
		expect(url).not.toContain("+");
		expect(url).toContain("%20");
		expect(url).toContain("%2B");
		expect(new URL(url).searchParams.get("body")).toBe(body);
		expect(new URL(url).searchParams.get("title")).toBe(title);
	});
	it("serializes circular diagnostics, BigInt and nested errors", () => {
		const diagnostics: Record<string, unknown> = { bytes: 123n, cause: new Error("disk full") };
		diagnostics.self = diagnostics;
		const body = formatErrorReportBody({
			message: "failed",
			appVersion: "test",
			userAgent: "browser",
			diagnostics,
		});
		expect(body).toContain("[Circular]");
		expect(body).toContain('"123"');
		expect(body).toContain("disk full");
	});
	it("provides actionable reproduction prompts and a single-line title", () => {
		const body = formatErrorReportBody({ message: "failed", appVersion: "test", userAgent: "browser" });
		expect(body).toContain("Steps to reproduce");
		expect(body).toContain("Expected behavior");
		expect(body).toContain("after reloading");
		const title = formatErrorReportTitle("failed\nagain", "Playing");
		expect(title).toBe("DiabloWeb: Playing: failed again");
		expect(
			new URL(buildErrorReportUrl("https://github.com/example/repo/issues/new", body, title)).searchParams.get(
				"title"
			)
		).toBe(title);
		expect(formatErrorReportTitle("x".repeat(1000)).length).toBe(160);
	});
	it("bounds the encoded URL and requests the full report attachment", () => {
		const body = "Version: test\n" + "Ошибка 💥\n".repeat(10000);
		const url = buildErrorReportUrl("https://github.com/example/repo/issues/new", body, "Failure");
		expect(url.length).toBeLessThanOrEqual(MAX_ERROR_REPORT_URL_LENGTH);
		const draft = new URL(url).searchParams.get("body");
		expect(draft).toContain("Version: test");
		expect(draft).toContain(REPORT_ATTACHMENT_NOTICE);
		expect(body).toContain("Ошибка 💥\n".repeat(10000));
	});
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
