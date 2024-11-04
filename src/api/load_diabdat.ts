import axios from "axios";
import { IApi, IFileSystem } from "../types";

const DiabdatSizes = [517501282, 263402726, 263383766];

export { DiabdatSizes };

export default async function load_diabdat(api: IApi, fs: IFileSystem) {
	let file = fs.files.get("diabdat.mpq");
	if (file && !DiabdatSizes.includes(file.byteLength)) {
		fs.files.delete("diabdat.mpq");
		await fs.delete("diabdat.mpq");
		file = undefined;
	}
	if (!file) {
		const diabdat = await axios.request({
			url: import.meta.env.BASE_URL === "/" ? "diabdat.mpq" : import.meta.env.BASE_URL + "/diabdat.mpq",
			responseType: "arraybuffer",
			onDownloadProgress: (e) => {
				if (api.onProgress) {
					api.onProgress({
						text: "Downloading...",
						loaded: e.loaded,
						total: e.total || DiabdatSizes[1],
					});
				}
			},
			headers: {
				"Cache-Control": "max-age=31536000",
			},
		});
		if (!DiabdatSizes.includes(diabdat.data.byteLength)) {
			throw Error("Invalid diabdat.mpq size. Try clearing cache and refreshing the page.");
		}
		const data = new Uint8Array(diabdat.data);
		fs.files.set("diabdat.mpq", data);
		fs.update("diabdat.mpq", data.slice());
	}
	return fs;
}
