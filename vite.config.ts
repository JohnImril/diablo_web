import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
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
			manifest: {
				name: "Diablo Web App",
				short_name: "DIABLO",
				description: "Experience the classic Diablo game directly in your browser.",
				start_url: BASE,
				scope: BASE,
				display: "standalone",
				background_color: "#000000",
				theme_color: "#ffffff",
				icons: [
					{
						src: "icon-192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "any maskable",
					},
					{
						src: "icon-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any maskable",
					},
				],
			},
			devOptions: {
				enabled: true,
			},
		}),
	],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	build: {
		minify: "terser",
		sourcemap: false,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("peerjs")) return "peer";
				},
			},
		},
	},
});
