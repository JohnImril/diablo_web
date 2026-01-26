import type { ErrorReportPayload } from "../types";

type ErrorReportInput = ErrorReportPayload & {
	appVersion: string;
	userAgent: string;
};

export function formatErrorReportBody({ message, stack, appVersion, retail, userAgent }: ErrorReportInput): string {
	const lines = stack ? `${message}\n${stack}` : message;

	return `**Description:**
[Please describe what you were doing before the error occurred]

**App version:**
DiabloWeb ${appVersion} (${retail ? "Retail" : "Shareware"})

**Error message:**

${lines
	.split("\n")
	.map((line) => `    ${line}`)
	.join("\n")}

**User agent:**

    ${userAgent}

**Save file:**
[Please attach the save file, if applicable. The error box should have a link to download the current save you were playing; alternatively, you can open dev console on the game page (F12) and type in DownloadSaves()]
`;
}

export function buildErrorReportUrl(baseUrl: string, body: string): string {
	const url = new URL(baseUrl);
	url.searchParams.set("body", body);
	return url.toString();
}
