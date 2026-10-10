import { useCallback, useState, useRef, useEffect } from "react";

import type { IError } from "../../types";
import { createErrorReport } from "../runtime/errorReport";

export const useErrorHandling = () => {
	const [error, setError] = useState<IError | undefined>(undefined);

	const isMounted = useRef(true);
	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, []);

	const onError = useCallback((message: string, stack?: string, saveUrl?: string, retail?: boolean) => {
		createErrorReport({ message, stack, saveUrl, retail }).then((report) => {
			if (!isMounted.current) return;
			setError((prev) => {
				if (prev) return prev;
				return report;
			});
		});
	}, []);

	return { error, onError };
};
