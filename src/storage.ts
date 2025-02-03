import create_fs from "./fs";

async function init() {
	try {
		const fs = await create_fs();

		window.addEventListener("message", async ({ data, source }: MessageEvent) => {
			if (!source) {
				console.error("Message event source is null");
				return;
			}

			switch (data.method) {
				case "transfer":
					(source as WindowProxy).postMessage({ method: "storage", files: Array.from(fs.files) }, "*");
					break;
				case "clear":
					try {
						await fs.clear();
						console.log("File system cleared");
					} catch (error) {
						console.error("Failed to clear file system:", error);
					}
					break;
			}
		});
	} catch (error) {
		console.error("Failed to initialize file system:", error);
	}
}

init();
