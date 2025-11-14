import type { IApi, IFileSystem } from "../types";
import { fetchWithProgress } from "../utils/fetchWithProgress";

const SpawnSizes = [50274091, 25830791];

export { SpawnSizes };

export default async function load_spawn(api: IApi, fs: IFileSystem) {
	let file = fs.files.get("spawn.mpq");

	if (file && !SpawnSizes.includes(file.byteLength)) {
		fs.files.delete("spawn.mpq");
		await fs.delete("spawn.mpq");
		file = undefined;
	}

	if (!file) {
		const url = import.meta.env.BASE_URL === "/" ? "/spawn.mpq" : import.meta.env.BASE_URL + "/spawn.mpq";

		let lastEmit = 0;
		let lastPercent = -1;

		const buffer = await fetchWithProgress(
			url,
			(loaded, total) => {
				const t = total || SpawnSizes[1];
				const now = performance.now();
				const percent = t ? Math.floor((loaded / t) * 100) : 0;

				if (percent === lastPercent && now - lastEmit < 120 && loaded < t) return;

				lastEmit = now;
				lastPercent = percent;

				api.onProgress?.({
					text: "Downloading...",
					loaded,
					total: t,
				});
			},
			{
				headers: {
					"Cache-Control": "max-age=31536000",
				},
			}
		);

		const data = new Uint8Array(buffer);
		if (!SpawnSizes.includes(data.byteLength)) {
			throw new Error("Invalid spawn.mpq size. Try clearing cache and refreshing the page.");
		}
		fs.files.set("spawn.mpq", data);
		fs.update("spawn.mpq", data.slice());
	}

	return fs;
}
