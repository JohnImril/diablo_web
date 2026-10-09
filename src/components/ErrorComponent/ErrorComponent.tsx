import { useEffect, useState } from "react";
import cn from "classnames";
import SaveBackups from "../../app/ui/SaveBackups";

import type { IError } from "../../types";

import "./ErrorComponent.css";

interface IProps {
	error: IError;
	saveName?: string;
	onApplyUpdate?: () => void;
	onReload?: () => Promise<void>;
	loadBackups?: () => Promise<{ name: string; blob: Blob }[]>;
}

const ErrorComponent = ({ error, saveName, onApplyUpdate, onReload, loadBackups }: IProps) => {
	const { message = "Unknown error", reportUrl, save: saveUrl } = error;
	const [reloading, setReloading] = useState(false);
	const [reloadError, setReloadError] = useState<string>();
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
					<a className={cn("d1-link", "text-ruby")} href={saveUrl} download={saveName}>
						Download save file
					</a>
				</p>
			)}
			{onReload && (
				<div className="error-component__footer">
					<p>Reload to return to the start screen. Browser saves and game files will not be cleared.</p>
					<button
						type="button"
						className="d1-btn d1-btn--gold"
						disabled={reloading}
						onClick={async () => {
							setReloading(true);
							setReloadError(undefined);
							try {
								await onReload();
							} catch {
								setReloadError(
									"Could not safely prepare a reload. Keep this page open, download your saves below, then try again. No browser data has been cleared."
								);
								setReloading(false);
							}
						}}
					>
						{reloading ? "Finishing storage writes…" : "Reload and Try Again"}
					</button>
					{reloadError && <p role="alert">{reloadError}</p>}
					{reloadError && loadBackups && <SaveBackups load={loadBackups} />}
				</div>
			)}
			{onApplyUpdate && (
				<p className="error-component__footer">
					<button type="button" className="d1-btn d1-btn--gold" disabled={reloading} onClick={onApplyUpdate}>
						Update and reload
					</button>
				</p>
			)}
		</section>
	);
};

export default ErrorComponent;
