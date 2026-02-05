import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

const BASE = "/diablo_web/";
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	base: BASE,
	resolve: {
		alias: {
			app: path.resolve(ROOT_DIR, "src/app"),
			components: path.resolve(ROOT_DIR, "src/components"),
			constants: path.resolve(ROOT_DIR, "src/constants"),
			icons: path.resolve(ROOT_DIR, "src/icons"),
			modules: path.resolve(ROOT_DIR, "src/modules"),
			shared: path.resolve(ROOT_DIR, "src/shared"),
			types: path.resolve(ROOT_DIR, "src/types"),
		},
	},
	plugins: [
		react({
			babel: {
				plugins: [["babel-plugin-react-compiler"]],
			},
		}),
		wasm(),
		VitePWA({
			base: BASE,
			scope: BASE,
			registerType: "autoUpdate",
			injectRegister: "script-defer",
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
			workbox: {
				cleanupOutdatedCaches: true,
				runtimeCaching: [
					{
						urlPattern: new RegExp(`^${BASE}assets/`),
						handler: "CacheFirst",
						options: {
							cacheName: "assets-cache",
							expiration: {
								maxEntries: 200,
								maxAgeSeconds: 60 * 60 * 24 * 365,
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: ({ request }) => request.mode === "navigate",
						handler: "NetworkFirst",
						options: {
							cacheName: "html-cache",
							expiration: {
								maxEntries: 20,
								maxAgeSeconds: 60 * 60 * 24,
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
				],
			},

			devOptions: {
				enabled: true,
				type: "module",
			},
		}),
	],
	define: {
		"import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
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
