import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

const BASE = "/diablo_web/";

export default defineConfig({
	base: BASE,
	plugins: [
		react(),
		wasm(),
		VitePWA({
			base: BASE,
			scope: BASE,
			registerType: "autoUpdate",
			includeAssets: [
				"favicon.ico",
				"apple-touch-icon.png",
				"mstile-150.png",
				"icon-192.png",
				"icon-512.png",
				"og-image.png",
				"x-image.png",
			],
			devOptions: { enabled: true },
		}),
	],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
});
