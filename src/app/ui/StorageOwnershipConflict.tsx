import { useLayoutEffect, useRef, useState } from "react";
import "./StorageOwnershipConflict.css";

export default function StorageOwnershipConflict({ onRetry }: { onRetry: () => Promise<void> }) {
	const [retrying, setRetrying] = useState(false);
	const [retryError, setRetryError] = useState(false);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const retryInFlight = useRef(false);
	const mounted = useRef(false);
	useLayoutEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		mounted.current = true;
		dialog.showModal();
		return () => {
			mounted.current = false;
			dialog.close();
		};
	}, []);
	useLayoutEffect(() => {
		(retrying ? titleRef.current : buttonRef.current)?.focus();
	}, [retrying]);
	return (
		<dialog
			ref={dialogRef}
			className="storage-conflict"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="storage-conflict-title"
			aria-describedby="storage-conflict-description"
			onCancel={(event) => event.preventDefault()}
			onKeyDown={(event) => {
				// There is only one action. Native modality isolates the background;
				// keep Tab on this action rather than moving to browser chrome.
				if (event.key === "Tab") {
					event.preventDefault();
					(retrying ? titleRef.current : buttonRef.current)?.focus();
				}
			}}
		>
			<div className="d1-panel">
				<h1 ref={titleRef} tabIndex={-1} id="storage-conflict-title">
					Game already open
				</h1>
				<p id="storage-conflict-description">
					Another game page is using your saves. Close other Diablo Web tabs or windows, including the
					installed app, then try again.
				</p>
				<p>
					This page has not loaded or changed your saves. Try Again reloads this page to check access again.
				</p>
				<button
					ref={buttonRef}
					type="button"
					className="d1-btn d1-btn--gold"
					disabled={retrying}
					onClick={async () => {
						if (retryInFlight.current) return;
						retryInFlight.current = true;
						setRetrying(true);
						setRetryError(false);
						try {
							await onRetry();
						} catch {
							retryInFlight.current = false;
							if (!mounted.current) return;
							setRetryError(true);
							setRetrying(false);
						}
					}}
				>
					{retrying ? "Reloading…" : "Try Again"}
				</button>
				{retryError && <p role="alert">Could not prepare the reload. Keep this page open and try again.</p>}
			</div>
		</dialog>
	);
}
