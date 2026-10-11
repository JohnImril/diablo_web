import { mapStackTrace } from "../../utils/stacktrace/mapStackTrace";

import { buildErrorReportUrl, formatErrorReportBody } from "../../shared/errorReport";
import type { ErrorReportPayload, IError } from "../../types";

type ErrorReportInput = ErrorReportPayload & {
	saveUrl?: string;
};

const ISSUE_URL = "https://github.com/JohnImril/diablo_web/issues/new";

export function createErrorReport({ message, stack, saveUrl, retail, diagnostics }: ErrorReportInput): Promise<IError> {
	return new Promise((resolve) => {
		const finalize = (mappedStack?: string[]) => {
			const displayStack = mappedStack?.join("\n") || stack;
			const reportBody = formatErrorReportBody({
				message,
				stack: displayStack ?? stack,
				appVersion: import.meta.env.VITE_APP_VERSION,
				retail,
				userAgent: navigator.userAgent,
				diagnostics: {
					buildId: import.meta.env.VITE_APP_BUILD_ID,
					occurredAt: new Date().toISOString(),
					page: location.origin + location.pathname,
					online: navigator.onLine,
					secureContext: globalThis.isSecureContext,
					hardwareConcurrency: navigator.hardwareConcurrency,
					serviceWorker: navigator.serviceWorker?.controller?.scriptURL ?? "none",
					saveAvailable: Boolean(saveUrl),
					...diagnostics,
				},
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
			// A missing source map must never prevent the error dialog from opening.
			const timer = setTimeout(() => finalize(), 1500);
			try {
				mapStackTrace(stack, (mapped) => {
					clearTimeout(timer);
					finalize(mapped);
				});
			} catch {
				clearTimeout(timer);
				finalize();
			}
			return;
		}

		finalize();
	});
}
