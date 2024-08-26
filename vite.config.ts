import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import packageJson from "./package.json";

function jsccPlugin() {
	return {
		name: "vite-plugin-jscc",
		transform(code: string[], id: string) {
			if (id.endsWith(".jscc")) {
				const functionName = id.includes("DiabloSpawn")
					? "DiabloSpawn"
					: id.includes("MpqCmp")
					? "MpqCmp"
					: "Diablo";

				return {
					code: `${code}\nexport default ${functionName};`,
					map: null,
				};
			}
		},
	};
}

export default defineConfig({
	plugins: [react(), wasm(), jsccPlugin()],
	resolve: {
		alias: {
			path: "path-browserify",
			fs: "empty-module",
		},
	},
	define: {
		"empty-module": "{}",
		"import.meta.env.VERSION": JSON.stringify(packageJson.version),
	},
});
