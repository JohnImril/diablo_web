import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import packageJson from "./package.json";

function jsccPlugin() {
	return {
		name: "vite-plugin-jscc",
		transform(src: string, id: string) {
			if (id.endsWith(".jscc")) {
				const functionName = id.includes("DiabloSpawn")
					? "DiabloSpawn"
					: id.includes("MpqCmp")
						? "MpqCmp"
						: "Diablo";

				return {
					code: `
						${src}
						export default ${functionName};
					`,
					map: null,
				};
			}
			return null;
		},
	};
}

export default defineConfig({
	base: "/diablo_web/",
	plugins: [react(), wasm(), jsccPlugin()],
	define: {
		"import.meta.env.VERSION": JSON.stringify(packageJson.version),
	},
});
