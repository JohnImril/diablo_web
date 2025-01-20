import React, { useCallback } from "react";

import { IError } from "../../types";

import "./ErrorComponent.css";

interface IProps {
	error: IError;
	retail?: boolean;
	saveUrl?: string;
	saveName?: string;
}

const ErrorComponent: React.FC<IProps> = ({ error, retail, saveUrl, saveName }) => {
	const buildReportLink = useCallback(() => {
		const { message = "Unknown error", stack } = error;
		const lines = stack ? `${message}\n${stack}` : message;
		const url = new URL("https://github.com/JohnImril/diablo_web/issues/new");

		const body = `**Description:**
		[Please describe what you were doing before the error occurred]

		**App version:**
		DiabloWeb ${__APP_VERSION__} (${retail ? "Retail" : "Shareware"})

		**Error message:**

		${lines
			.split("\n")
			.map((line) => `    ${line}`)
			.join("\n")}

		**User agent:**

			${navigator.userAgent}

		**Save file:**
		[Please attach the save file, if applicable. The error box should have a link to download the current save you were playing; alternatively, you can open dev console on the game page (F12) and type in DownloadSaves()]
		`;

		url.searchParams.set("body", body);
		return url.toString();
	}, [error, retail]);

	const reportLink = buildReportLink();

	return (
		<div className="error-component">
			<p className="error-component__header">The following error has occurred:</p>
			<p className="error-component__body">{error.message}</p>

			<p className="error-component__footer">
				<a href={reportLink} target="_blank" rel="noopener noreferrer" className="error-component__report-link">
					Create an issue on GitHub
				</a>
			</p>

			{saveUrl && (
				<p className="error-component__save-wrapper">
					<a className="error-component__save-link" href={saveUrl} download={saveName}>
						Download save file
					</a>
				</p>
			)}
		</div>
	);
};

export default ErrorComponent;
