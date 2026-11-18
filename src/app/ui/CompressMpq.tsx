import { useState, useEffect, useRef, type ChangeEvent, useCallback } from "react";
import cn from "classnames";
import type { IProgress, ProgressReporter } from "../../types";
import LoadingComponent from "../../components/LoadingComponent/LoadingComponent";
import { normalizeError } from "../../shared/normalizeError";

import "./CompressMpq.css";

interface IProps {
	file: File | null;
	setCompressFile: (file: File | null) => void;
	setCompress: (compress: boolean) => void;
	onError: (message: string, stack: string, diagnostics?: Record<string, unknown>) => void;
	runCompress: (file: File, progress: ProgressReporter) => Promise<Blob>;
	downloadBlob: (filename: string, blob: Blob) => string;
	revokeBlobUrl: (url: string) => void;
}

const CompressMpq = ({
	file,
	setCompressFile,
	setCompress,
	onError,
	runCompress,
	downloadBlob,
	revokeBlobUrl,
}: IProps) => {
	const [url, setUrl] = useState<string | null>(null);
	const [progress, setProgress] = useState<IProgress | undefined>(undefined);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const isProcessing = !!file && !url;
	const stage = url ? "complete" : isProcessing ? "processing" : "select";

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		dialog.showModal();
		return () => {
			dialog.close();
			requestAnimationFrame(() => {
				if (document.querySelector("dialog[open]")) return;
				const trigger = document.querySelector<HTMLButtonElement>("[data-compress-trigger]");
				const details = trigger?.closest("details");
				if (details) details.open = true;
				trigger?.focus();
			});
		};
	}, []);

	useEffect(() => {
		titleRef.current?.focus();
	}, [stage]);

	const onDone = useCallback(
		(blob: Blob) => {
			const fileUrl = downloadBlob("DIABDAT.MPQ", blob);
			setUrl(fileUrl);
		},
		[downloadBlob]
	);

	const onErrorHandler = useCallback(
		(message: string, stack: string, diagnostics?: Record<string, unknown>) => {
			setCompress(false);
			onError(message, stack, diagnostics);
		},
		[onError, setCompress]
	);

	const onClose = () => {
		if (url) {
			revokeBlobUrl(url);
		}
		setUrl(null);
		setCompress(false);
		setCompressFile(null);
	};

	const parseFile = (e: ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0];
		if (selectedFile) {
			setCompressFile(selectedFile);
		}
	};

	useEffect(() => {
		if (!file) return;

		const controller = new AbortController();
		let lastProgress: IProgress | undefined;
		const startedAt = performance.now();

		runCompress(file, (text, loaded, total) => {
			lastProgress = { text, loaded: loaded ?? 0, total };
			if (!controller.signal.aborted) setProgress(lastProgress);
		})
			.then((blob) => {
				if (!controller.signal.aborted) onDone(blob);
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return;
				const normalized = normalizeError(error);
				onErrorHandler(normalized.message, normalized.stack ?? "", {
					...(error && typeof error === "object" && "diagnostics" in error
						? (error.diagnostics as Record<string, unknown>)
						: {}),
					operation: "MPQ compression",
					file: { name: file.name, size: file.size, type: file.type || "unknown" },
					progress: lastProgress,
					elapsedMs: Math.round(performance.now() - startedAt),
					errorType: normalized.name,
					errorDetails: normalized.details,
				});
			});

		return () => {
			controller.abort();
		};
	}, [file, onErrorHandler, onDone, runCompress]);

	useEffect(() => {
		return () => {
			if (url) {
				revokeBlobUrl(url);
			}
		};
	}, [revokeBlobUrl, url]);

	return (
		<dialog
			ref={dialogRef}
			className={cn("compress-mpq", "u-center-abs", "u-modal", "u-scrollbar-gold", "d1-panel")}
			aria-labelledby="compress-mpq-title"
			onCancel={(event) => {
				event.preventDefault();
				// Compression has no cancellation API; keep the progress view open until it finishes.
				if (!isProcessing) onClose();
			}}
		>
			<h2 id="compress-mpq-title" ref={titleRef} tabIndex={-1}>
				{url ? "MPQ compression completed" : isProcessing ? "Compressing MPQ" : "MPQ compression"}
			</h2>
			{url ? (
				<>
					<p className="compress-mpq__message">
						<a className="d1-link" href={url} download="DIABDAT.MPQ">
							Click here if download doesn&apos;t start.
						</a>
					</p>
					<button
						type="button"
						className={cn("compress-mpq__button", "d1-btn", "d1-btn--gold")}
						onClick={onClose}
					>
						Back
					</button>
				</>
			) : isProcessing ? (
				<>
					<LoadingComponent title="Processing..." progress={progress} embedded />
					<p className="compress-mpq__description">Please wait until compression finishes.</p>
				</>
			) : (
				<>
					<p className="compress-mpq__description">
						You can use this tool to reduce the original MPQ to about half its size. It encodes sounds in
						MP3 format and uses better compression for regular files. To begin, click the button below or
						drop the MPQ onto the page.
					</p>
					<button
						type="button"
						className={cn("compress-mpq__button", "d1-btn")}
						onClick={() => fileInputRef.current?.click()}
					>
						Select MPQ
					</button>
					<input
						ref={fileInputRef}
						accept=".mpq"
						type="file"
						hidden
						aria-label="Choose an MPQ file to compress"
						onChange={parseFile}
					/>
					<button
						type="button"
						className={cn("compress-mpq__button", "d1-btn", "d1-btn--gold")}
						onClick={onClose}
					>
						Back
					</button>
				</>
			)}
		</dialog>
	);
};

export default CompressMpq;
