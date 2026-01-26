import { useEffect, useState } from "react";

import type { FileDropRuntime } from "../../types";

export const useFileDrop = (runtime: FileDropRuntime, onDropFile: (file: File) => void): { dropping: number } => {
	const [dropping, setDropping] = useState(0);

	useEffect(() => {
		const detach = runtime.attachFileDrop({
			onDropFile,
			onDroppingChange: setDropping,
		});
		return () => detach();
	}, [onDropFile, runtime]);

	return { dropping };
};
