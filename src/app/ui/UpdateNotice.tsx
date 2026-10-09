import { useEffect, useState } from "react";
import cn from "classnames";
import SaveBackups from "./SaveBackups";
import { isUpdating, type UpdateStatus } from "../updates/updateCoordinator";

type Props = {
	status: UpdateStatus;
	started: boolean;
	canRetry: boolean;
	onApply: () => void;
	loadBackups: () => Promise<{ name: string; blob: Blob }[]>;
};
export default function UpdateNotice({ status, started, canRetry, onApply, loadBackups }: Props) {
	const [noticeExpanded, setNoticeExpanded] = useState(true);
	const updating = isUpdating(status);
	const updateFailed = status === "error" || status === "storage-error";
	useEffect(() => {
		if (status !== "available") return;
		const timer = window.setTimeout(() => setNoticeExpanded(false), 6000);
		return () => window.clearTimeout(timer);
	}, [status]);
	return (
		<>
			{status === "available" && (
				<div
					className={cn("app__update-notice", { "app__update-notice--compact": started && !noticeExpanded })}
					role="status"
				>
					{started && !noticeExpanded
						? "Update ready"
						: started
							? "Update available. It will apply when you return to the start screen."
							: "Update available."}
					{started && noticeExpanded && (
						<button
							type="button"
							className="d1-link"
							onClick={() => setNoticeExpanded(false)}
							aria-label="Dismiss update notification"
						>
							×
						</button>
					)}
				</div>
			)}
			{updateFailed && (
				<div className="app__update-notice" role="alert">
					<p>
						{status === "storage-error"
							? "Saving failed or took too long. Reload is blocked to protect your saves. Download a backup before closing this page."
							: "The update could not be applied. You can keep playing and retry from the menu."}
					</p>
					<button type="button" className="d1-btn" disabled={!canRetry} onClick={onApply}>
						Retry update
					</button>
					{status === "storage-error" && <SaveBackups load={loadBackups} />}
				</div>
			)}
			{updating && (
				<div className="app__update-overlay" role="status" aria-live="polite">
					<div className="d1-panel">
						<span className="app__update-spinner" aria-hidden="true" />
						<h2>Updating game…</h2>
						<p>
							{status === "saving"
								? "Finishing save…"
								: "Waiting for other game tabs and applying update…"}
						</p>
						<p>Please wait. The page will reload automatically.</p>
					</div>
				</div>
			)}
		</>
	);
}
