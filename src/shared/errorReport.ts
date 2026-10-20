import type { ErrorReportPayload } from "../types";
import { normalizeError } from "./normalizeError";

export const MAX_ERROR_REPORT_URL_LENGTH = 6000;
export const REPORT_ATTACHMENT_NOTICE =
	"Download the diagnostic report from the error dialog and attach diabloweb-error-report.txt here. The full report is too large to include in this link.";

export function formatErrorReportTitle(message: string, operation?: unknown): string {
	return `DiabloWeb: ${typeof operation === "string" ? `${operation}: ` : ""}${message}`
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 160);
}

type ErrorReportInput = ErrorReportPayload & {
	appVersion: string;
	userAgent: string;
};

export function formatErrorReportBody({
	message,
	stack,
	appVersion,
	retail,
	userAgent,
	diagnostics,
}: ErrorReportInput): string {
	const lines = stack ? `${message}\n${stack}` : message;

	return `**Description:**
[Describe what you were doing just before the error.]

**Steps to reproduce:**
1. [First action]
2. [Action that triggered the error]

**Expected behavior:**
[What should have happened?]

**Does it happen again after reloading?**
[Yes / No / Not tried]

Technical diagnostics are collected below automatically. Review them before submitting.

**App version:**
DiabloWeb ${appVersion} (${retail === undefined ? "Not started / unknown" : retail ? "Retail" : "Shareware"})

**Error message:**

${lines
	.split("\n")
	.map((line) => `    ${line}`)
	.join("\n")}

**User agent:**

    ${userAgent}

**Automatic diagnostics:**

${(normalizeError(diagnostics ?? {}).details ?? "Unable to serialize diagnostics")
	.split("\n")
	.map((line) => `    ${line}`)
	.join("\n")}

**Save file:**
${diagnostics?.operation === "MPQ compression" ? "Not applicable: this error occurred while compressing a game archive." : "If a save download is offered in the error dialog, attach it here. Save files are not uploaded automatically."}
`;
}

export function buildErrorReportUrl(baseUrl: string, body: string, title?: string): string {
	const url = new URL(baseUrl);
	if (title) url.searchParams.set("title", title);
	url.searchParams.set("body", body);
	// Some issue form handlers preserve form-encoded '+' as literal text.
	// Encode spaces explicitly, and use the same representation for the size limit.
	const serialize = () => url.toString().replace(/\+/g, "%20");
	if (serialize().length > MAX_ERROR_REPORT_URL_LENGTH) {
		// Keep the report header and fit the encoded URL, including non-ASCII text.
		let low = 0;
		let high = body.length;
		while (low < high) {
			const middle = Math.ceil((low + high) / 2);
			url.searchParams.set("body", `${body.slice(0, middle)}\n\n[Report shortened]\n${REPORT_ATTACHMENT_NOTICE}`);
			if (serialize().length <= MAX_ERROR_REPORT_URL_LENGTH) low = middle;
			else high = middle - 1;
		}
		url.searchParams.set("body", `${body.slice(0, low)}\n\n[Report shortened]\n${REPORT_ATTACHMENT_NOTICE}`);
	}
	return serialize();
}
