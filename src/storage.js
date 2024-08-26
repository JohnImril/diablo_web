import create_fs from "./fs";

async function init() {
	const fs = await create_fs();

	window.addEventListener("message", ({ data, source }) => {
		if (data.method === "transfer") {
			source.postMessage({ method: "storage", files: Array.from(fs.files) }, "*");
		} else if (data.method === "clear") {
			fs.clear()
				.then(() => {
					console.log("File system cleared");
				})
				.catch((error) => {
					console.error("Failed to clear file system:", error);
				});
		}
	});
}

init().catch((error) => {
	console.error("Failed to initialize file system:", error);
});
