import { mapStackTrace } from "../../utils/stacktrace/mapStackTrace";

import { buildErrorReportUrl, formatErrorReportBody, formatErrorReportTitle } from "../../shared/errorReport";
import type { ErrorReportPayload, IError } from "../../types";
import { MAX_SOURCE_MAP_BYTES, resolveSourceMap } from "./resolveSourceMap";

type ErrorReportInput = ErrorReportPayload & {
	saveUrl?: string;
};

const ISSUE_URL = "https://github.com/JohnImril/diablo_web/issues/new";

export function createErrorReport({ message, stack, saveUrl, retail, diagnostics }: ErrorReportInput): Promise<IError> {
	return new Promise((resolve) => {
		let finalized = false;
		const finalize = (mappedStack?: string[]) => {
			if (finalized) return;
			finalized = true;
			const displayStack = mappedStack?.join("\n") || stack;
			let reportBody: string;
			let title = formatErrorReportTitle(message);
			try {
				title = formatErrorReportTitle(message, diagnostics?.operation);
				reportBody = formatErrorReportBody({
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
						...(displayStack !== stack ? { originalStack: stack } : {}),
					},
				});
			} catch {
				const errorText = [message, stack].filter((line): line is string => Boolean(line)).join("\n");
				reportBody = `**Error message:**\n\n    ${errorText.replace(/\n/g, "\n    ")}\n\nAutomatic diagnostics could not be collected. Describe what you were doing and how to reproduce the error.`;
			}
			const reportUrl = buildErrorReportUrl(ISSUE_URL, reportBody, title);
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
			const controller = new AbortController();
			const timer = setTimeout(() => {
				controller.abort();
				finalize();
			}, 1500);
			try {
				mapStackTrace(
					stack,
					{
						cache: false,
						maxFileCount: 4,
						maxSourceMapSize: MAX_SOURCE_MAP_BYTES,
						resolveSourceMap: (uri) =>
							resolveSourceMap(
								uri,
								new URL(`${import.meta.env.BASE_URL}assets/`, location.origin).href,
								controller.signal
							),
					},
					(mapped) => {
						clearTimeout(timer);
						controller.abort();
						finalize(mapped);
					}
				);
			} catch {
				clearTimeout(timer);
				controller.abort();
				finalize();
			}
			return;
		}

		finalize();
	});
}
