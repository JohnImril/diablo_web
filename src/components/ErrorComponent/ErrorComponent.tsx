import { useEffect } from "react";
import cn from "classnames";

import type { IError } from "../../types";

import "./ErrorComponent.css";

interface IProps {
	error: IError;
	saveName?: string;
}

const ErrorComponent = ({ error, saveName }: IProps) => {
	const { message = "Unknown error", reportUrl, save: saveUrl } = error;
	useEffect(() => {
		return () => {
			if (saveUrl) {
				URL.revokeObjectURL(saveUrl);
			}
		};
	}, [saveUrl]);

	return (
		<section
			className={cn(
				"error-component",
				"u-center-abs",
				"u-modal",
				"d1-panel",
				"d1-panel--ruby",
				"u-scrollbar-gold"
			)}
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="error-component-title"
			aria-describedby="error-component-body"
		>
			<p id="error-component-title" className={cn("error-component__header", "text-ruby")}>
				<b>The following error has occurred:</b>
			</p>

			<p id="error-component-body" className="error-component__body">
				{message}
			</p>

			<p className="error-component__footer">
				<a href={reportUrl} target="_blank" rel="noopener noreferrer" className={cn("d1-btn", "d1-btn--gold")}>
					Create an issue on GitHub
				</a>
			</p>

			{saveUrl && (
				<p className="error-component__save-wrapper">
					<a
						className={cn("d1-link", "text-ruby")}
						href={saveUrl}
						download={saveName}
						onClick={() => {
							setTimeout(() => URL.revokeObjectURL(saveUrl), 0);
						}}
					>
						Download save file
					</a>
				</p>
			)}
		</section>
	);
};

export default ErrorComponent;
