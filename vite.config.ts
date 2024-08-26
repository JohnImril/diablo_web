import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import packageJson from "./package.json";

export default defineConfig({
	base: "/diablo_web/",
	plugins: [react(), wasm()],
	define: {
		"import.meta.env.VERSION": JSON.stringify(packageJson.version),
	},
});
