import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import packageJson from "./package.json";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	base: "/diablo_web/",
	plugins: [
		react(),
		wasm(),
		VitePWA({
			registerType: "autoUpdate",
			workbox: {
				runtimeCaching: [
					{
						urlPattern: /\/.*\.(?:html|css|js|wasm)$/,
						handler: "CacheFirst",
						options: {
							cacheName: "static-resources",
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 30 * 24 * 60 * 60,
							},
						},
					},
				],
				navigateFallback: "/index.html",
				navigateFallbackAllowlist: [/^(?!\/__).*/],
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
			},
		}),
	],
	define: {
		"import.meta.env.VERSION": JSON.stringify(packageJson.version),
	},
});
