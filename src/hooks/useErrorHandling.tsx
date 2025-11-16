import { useCallback, useState, useRef, useEffect } from "react";
import { mapStackTrace } from "sourcemapped-stacktrace";

import type { IError, IFileSystem } from "../types";

export const useErrorHandling = (
	fileSystemRef: React.RefObject<Promise<IFileSystem>>,
	saveNameRef: React.RefObject<string | undefined>
) => {
	const [error, setError] = useState<IError | undefined>(undefined);

	const isMounted = useRef(true);
	useEffect(() => {
		return () => {
			isMounted.current = false;
		};
	}, []);

	const onError = useCallback(
		async (message: string, stack?: string) => {
			const errorObject: IError = { message };

			if (saveNameRef.current) {
				try {
					const fsInstance = await fileSystemRef.current;
					errorObject.save = await fsInstance.fileUrl(saveNameRef.current);
				} catch (e) {
					console.warn("Failed to get save URL:", e);
				}
			}

			const updateErrorState = (mappedStack?: string[]) => {
				if (!isMounted.current) return;
				setError((prev) => {
					if (prev) return prev;
					return {
						...errorObject,
						stack: mappedStack?.join("\n"),
					};
				});
			};

			if (stack) {
				mapStackTrace(stack, updateErrorState);
			} else {
				updateErrorState();
			}
		},
		[fileSystemRef, saveNameRef]
	);

	return { error, onError };
};
