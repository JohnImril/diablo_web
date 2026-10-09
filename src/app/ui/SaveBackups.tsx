import { useEffect, useState } from "react";

type Backup = { name: string; blob: Blob };
type Link = { name: string; url: string };

export default function SaveBackups({ load }: { load: () => Promise<Backup[]> }) {
	const [links, setLinks] = useState<Link[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [retry, setRetry] = useState(0);
	useEffect(() => {
		let cancelled = false;
		let urls: Link[] = [];
		void load()
			.then((backups) => {
				if (cancelled) return;
				urls = backups.map(({ name, blob }) => ({ name, url: URL.createObjectURL(blob) }));
				setLinks(urls);
				setFailed(false);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
			urls.forEach(({ url }) => URL.revokeObjectURL(url));
		};
	}, [load, retry]);
	if (failed)
		return (
			<p>
				Could not prepare save downloads. Keep this page open.{" "}
				<button
					type="button"
					className="d1-link"
					onClick={() => {
						setFailed(false);
						setLinks(null);
						setRetry((value) => value + 1);
					}}
				>
					Retry downloads
				</button>
			</p>
		);
	if (!links) return <p role="status">Preparing save downloads…</p>;
	if (!links.length) return <p>No save files are available in memory.</p>;
	return (
		<div className="app__save-backups">
			<p>
				Download each save separately. These copies contain the data available in memory when the links were
				prepared.
			</p>
			<button
				type="button"
				className="d1-link"
				onClick={() => {
					setLinks(null);
					setRetry((value) => value + 1);
				}}
			>
				Refresh save links
			</button>
			{links.map(({ name, url }) => (
				<a className="d1-link" key={name} href={url} download={name}>
					Download {name}
				</a>
			))}
		</div>
	);
}
