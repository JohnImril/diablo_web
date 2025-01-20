import { useCallback, useState } from "react";
import { mapStackTrace } from "sourcemapped-stacktrace";

import { IError, IFileSystem } from "../types";

export const useErrorHandling = (
	fs: React.RefObject<Promise<IFileSystem>>,
	saveNameRef: React.RefObject<string | undefined>
) => {
	const [error, setError] = useState<IError | undefined>(undefined);

	const onError = useCallback(
		async (message: string, stack?: string) => {
			const errorObject: IError = { message };

			if (saveNameRef.current) {
				const fsInstance = await fs.current;
				errorObject.save = await fsInstance.fileUrl(saveNameRef.current);
			}

			const updateErrorState = (mappedStack?: string[]) => {
				setError((prevError) => {
					if (!prevError) {
						return {
							...errorObject,
							stack: mappedStack?.join("\n"),
						};
					}
					return prevError;
				});
			};

			if (stack) {
				mapStackTrace(stack, (mappedStack) => updateErrorState(mappedStack));
			} else {
				updateErrorState();
			}
		},
		[fs, saveNameRef]
	);

	return { error, onError };
};
