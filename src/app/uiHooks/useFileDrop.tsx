import { useEffect, useState } from "react";

type FileDropRuntime = {
	attachFileDrop: (opts: {
		onDropFile: (file: File) => void;
		onDroppingChange?: (count: number) => void;
	}) => () => void;
};

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
