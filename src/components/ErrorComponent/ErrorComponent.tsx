import { IError } from "../../types";

const ErrorComponent: React.FC<{
	error: IError;
	reportLink: string;
	saveUrl?: string;
	saveName?: string;
}> = ({ error, reportLink, saveUrl, saveName }) => {
	return (
		<a target="_blank" rel="noopener noreferrer" className="error" href={reportLink}>
			<p className="header">The following error has occurred:</p>
			<p className="body">{error.message}</p>
			<p className="footer">Click to create an issue on GitHub</p>
			{saveUrl != null && (
				<a href={saveUrl} download={saveName}>
					Download save file
				</a>
			)}
		</a>
	);
};

export default ErrorComponent;
