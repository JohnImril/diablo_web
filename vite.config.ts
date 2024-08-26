import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import packageJson from "./package.json";

function jsccPlugin() {
	return {
		name: "vite-plugin-jscc",
		transform(code, id) {
			if (id.endsWith(".jscc")) {
				// Определяем имя переменной на основе имени файла
				const functionName = id.includes("DiabloSpawn")
					? "DiabloSpawn"
					: id.includes("MpqCmp")
					? "MpqCmp"
					: "Diablo";

				// Ожидаем, что содержимое файла уже содержит IIFE, поэтому просто оборачиваем и экспортируем результат
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
