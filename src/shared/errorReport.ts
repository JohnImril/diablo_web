import type { ErrorReportPayload } from "../types";

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
[Optional: add anything that may help reproduce the error. Technical diagnostics are collected below automatically.]

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

${JSON.stringify(diagnostics ?? {}, null, 2)
	.split("\n")
	.map((line) => `    ${line}`)
	.join("\n")}

**Save file:**
${diagnostics?.operation === "MPQ compression" ? "Not applicable: this error occurred while compressing a game archive." : "If a save download is offered in the error dialog, attach it here. Save files are not uploaded automatically."}
`;
}

export function buildErrorReportUrl(baseUrl: string, body: string): string {
	const url = new URL(baseUrl);
	url.searchParams.set("body", body);
	return url.toString();
}
