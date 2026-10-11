import { useCallback, useState, useRef, useEffect } from "react";

import type { IError } from "../../types";
import { createErrorReport } from "../runtime/errorReport";
import { normalizeError } from "../../shared/normalizeError";

export const useErrorHandling = () => {
	const [error, setError] = useState<IError | undefined>(undefined);

	const isMounted = useRef(true);
	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, []);

	const onError = useCallback(
		(
			message: unknown,
			stack?: string,
			saveUrl?: string,
			retail?: boolean,
			diagnostics?: Record<string, unknown>
		) => {
			const normalized = normalizeError(message);
			createErrorReport({
				message: normalized.message,
				stack: stack || normalized.stack,
				saveUrl,
				retail,
				diagnostics: { errorType: normalized.name, errorDetails: normalized.details, ...diagnostics },
			}).then((report) => {
				if (!isMounted.current) return;
				setError((prev) => {
					if (prev) return prev;
					return report;
				});
			});
		},
		[]
	);

	return { error, onError };
};
