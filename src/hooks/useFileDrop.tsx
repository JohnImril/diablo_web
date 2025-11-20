import { useEffect, useState } from "react";

export const useFileDrop = (onDropFile: (file: File) => void): { dropping: number } => {
	const [dropping, setDropping] = useState(0);

	useEffect(() => {
		const handleDrop = (e: DragEvent) => {
			e.preventDefault();
			const file = getDropFile(e);
			if (!file) return;
			onDropFile(file);
			setDropping(0);
		};

		const handleDragOver = (e: DragEvent) => {
			if (isDropFile(e)) e.preventDefault();
		};

		const handleDragEnter = (e: DragEvent) => {
			if (!isDropFile(e)) return;
			e.preventDefault();
			setDropping((prev) => Math.max(prev + 1, 0));
		};

		const handleDragLeave = (e: DragEvent) => {
			if (!isDropFile(e)) return;
			setDropping((prev) => Math.max(prev - 1, 0));
		};

		document.addEventListener("drop", handleDrop, true);
		document.addEventListener("dragover", handleDragOver, true);
		document.addEventListener("dragenter", handleDragEnter, true);
		document.addEventListener("dragleave", handleDragLeave, true);

		return () => {
			document.removeEventListener("drop", handleDrop, true);
			document.removeEventListener("dragover", handleDragOver, true);
			document.removeEventListener("dragenter", handleDragEnter, true);
			document.removeEventListener("dragleave", handleDragLeave, true);
		};
	}, [onDropFile]);

	return { dropping };
};

function isDropFile(e: DragEvent) {
	if (e.dataTransfer?.items) {
		return Array.from(e.dataTransfer.items).some((item) => item.kind === "file");
	}
	return !!e.dataTransfer?.files?.length;
}

function getDropFile(e: DragEvent) {
	if (e.dataTransfer?.items) {
		for (const item of e.dataTransfer.items) {
			if (item.kind === "file") {
				return item.getAsFile();
			}
		}
	}
	return e.dataTransfer?.files[0] || null;
}
