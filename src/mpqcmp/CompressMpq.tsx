import React, { useState, useEffect, ChangeEvent } from "react";
import compress from "./compress";
import { IProgress } from "../types";
import LoadingComponent from "../components/LoadingComponent/LoadingComponent";

import "./CompressMpq.css";

interface IProps {
	file: File | null;
	setCompressFile: (file: File | null) => void;
	setCompress: (compress: boolean) => void;
	onError: (message: string, stack: string) => void;
}

const CompressMpq: React.FC<IProps> = ({ file, setCompressFile, setCompress, onError }) => {
	const [url, setUrl] = useState<string | null>(null);
	const [started, setStarted] = useState<boolean>(false);
	const [progress, setProgress] = useState<IProgress | undefined>(undefined);

	const onDone = (blob: Blob) => {
		const fileUrl = URL.createObjectURL(blob);
		setUrl(fileUrl);

		const link = document.createElement("a");
		link.href = fileUrl;
		link.download = "DIABDAT.MPQ";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const onErrorHandler = (message: string, stack: string) => {
		setCompress(false);
		onError(message, stack);
	};

	const onClose = () => {
		if (url) {
			URL.revokeObjectURL(url);
			setUrl(null);
		}
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
		if (file) {
			setStarted(true);
			compress(file, (text, loaded, total) => setProgress({ text, loaded: loaded || 0, total }))
				.then(onDone)
				.catch((e) => onErrorHandler(e.message, e.stack));
		}

		return () => {
			if (url) {
				URL.revokeObjectURL(url);
				setUrl(null);
			}
		};
	}, [file]);

	if (url) {
		return (
			<div className="compress-mpq">
				<p className="compress-mpq__message">
					<a href={url} download="DIABDAT.MPQ">
						Click here if download doesn't start.
					</a>
				</p>
				<div className="compress-mpq__button" onClick={onClose}>
					Back
				</div>
			</div>
		);
	}

	if (started) {
		return <LoadingComponent title="Processing..." progress={progress} />;
	}

	return (
		<div className="compress-mpq">
			<p className="compress-mpq__description">
				You can use this tool to reduce the original MPQ to about half its size. It encodes sounds in MP3 format
				and uses better compression for regular files. To begin, click the button below or drop the MPQ onto the
				page.
			</p>
			<form className="compress-mpq__form">
				<label htmlFor="loadFile" className="compress-mpq__button">
					Select MPQ
				</label>
				<input accept=".mpq" type="file" id="loadFile" style={{ display: "none" }} onChange={parseFile} />
			</form>
			<div className="compress-mpq__button" onClick={onClose}>
				Back
			</div>
		</div>
	);
};

export default CompressMpq;
