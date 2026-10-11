import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapStackTrace } from "../../utils/stacktrace/mapStackTrace";
import { createErrorReport } from "./errorReport";
import { MAX_ERROR_REPORT_URL_LENGTH, REPORT_ATTACHMENT_NOTICE } from "../../shared/errorReport";

vi.mock("../../utils/stacktrace/mapStackTrace", () => ({ mapStackTrace: vi.fn() }));

describe("createErrorReport", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("navigator", { userAgent: "test browser", onLine: true, hardwareConcurrency: 4 });
		vi.stubGlobal("location", {
			origin: "https://example.com",
			pathname: "/game",
			search: "?token=secret",
			hash: "#private",
		});
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.resetAllMocks();
	});
	it("keeps the full download while shortening the GitHub draft", async () => {
		const details = "diagnostic data ".repeat(10000);
		const report = await createErrorReport({ message: "failed", diagnostics: { operation: "Playing", details } });
		expect(report.reportBody).toContain(details);
		expect(report.reportBody).not.toContain("token=secret");
		expect(report.reportBody).not.toContain("#private");
		expect(report.reportUrl.length).toBeLessThanOrEqual(MAX_ERROR_REPORT_URL_LENGTH);
		const url = new URL(report.reportUrl);
		expect(url.searchParams.get("title")).toBe("DiabloWeb: Playing: failed");
		expect(url.searchParams.get("body")).toContain(REPORT_ATTACHMENT_NOTICE);
	});
	it("returns a minimal report when collecting diagnostics throws", async () => {
		const diagnostics = Object.defineProperty({}, "operation", {
			get() {
				throw new Error("broken getter");
			},
		});
		const report = await createErrorReport({ message: "original failure", diagnostics });
		expect(report.message).toBe("original failure");
		expect(report.reportBody).toContain("Automatic diagnostics could not be collected");
	});
	it("opens a report even when source mapping never finishes", async () => {
		vi.mocked(mapStackTrace).mockReturnValue(new Promise(() => {}));
		const pending = createErrorReport({ message: "failed", stack: "original trace" });
		await vi.advanceTimersByTimeAsync(1500);
		expect((await pending).reportBody).toContain("original trace");
	});
	it("falls back to the original stack when mapping throws", async () => {
		vi.mocked(mapStackTrace).mockImplementation(() => {
			throw new Error("mapping unavailable");
		});
		const report = await createErrorReport({ message: "failed", stack: "original trace" });
		expect(report.stack).toBe("original trace");
	});
});
