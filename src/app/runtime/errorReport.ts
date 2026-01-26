import { mapStackTrace } from "sourcemapped-stacktrace";

import { buildErrorReportUrl, formatErrorReportBody } from "../../shared/errorReport";
import type { IError } from "../../types";

type ErrorReportInput = {
	message: string;
	stack?: string;
	saveUrl?: string;
	retail?: boolean;
};

const ISSUE_URL = "https://github.com/JohnImril/diablo_web/issues/new";

export function createErrorReport({ message, stack, saveUrl, retail }: ErrorReportInput): Promise<IError> {
	return new Promise((resolve) => {
		const finalize = (mappedStack?: string[]) => {
			const displayStack = mappedStack?.join("\n");
			const reportBody = formatErrorReportBody({
				message,
				stack: displayStack ?? stack,
				appVersion: __APP_VERSION__,
				retail,
				userAgent: navigator.userAgent,
			});
			const reportUrl = buildErrorReportUrl(ISSUE_URL, reportBody);
			resolve({
				message,
				stack: displayStack,
				save: saveUrl,
				reportBody,
				reportUrl,
			});
		};

		if (stack) {
			mapStackTrace(stack, finalize);
			return;
		}

		finalize();
	});
}
