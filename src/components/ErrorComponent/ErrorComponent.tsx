import { IError } from "../../types";

import "./ErrorComponent.css";

const ErrorComponent: React.FC<{
	error: IError;
	reportLink: string;
	saveUrl?: string;
	saveName?: string;
}> = ({ error, reportLink, saveUrl, saveName }) => {
	return (
		<a target="_blank" rel="noopener noreferrer" className="error-component" href={reportLink}>
			<p className="error-component__header">The following error has occurred:</p>
			<p className="error-component__body">{error.message}</p>
			<p className="error-component__footer">Click to create an issue on GitHub</p>
			{saveUrl != null && (
				<a className="error-component__save-link" href={saveUrl} download={saveName}>
					Download save file
				</a>
			)}
		</a>
	);
};

export default ErrorComponent;
