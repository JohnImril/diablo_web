import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { VitePWA } from "vite-plugin-pwa";
import packageJson from "./package.json";

export default defineConfig({
	base: "/diablo_web/",
	plugins: [
		react(),
		wasm(),
		VitePWA({
			base: "/diablo_web/",
			registerType: "autoUpdate",
			workbox: {
				runtimeCaching: [
					{
						urlPattern: new RegExp("/diablo_web/.*\\.(?:html|css|js|wasm)$"),
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
				navigateFallback: "/diablo_web/index.html",
				navigateFallbackAllowlist: [/^(?!\/__).*/],
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
			},
			devOptions: {
				enabled: true,
			},
			includeAssets: ["/diablo_web/favicon.ico", "/diablo_web/robots.txt"],
			manifest: {
				name: "Diablo Web",
				short_name: "DiabloWeb",
				description: "Diablo Web App",
				background_color: "#000000",
				theme_color: "#000000",
				icons: [
					{
						src: "/diablo_web/icons/icon-192x192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "/diablo_web/icons/icon-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
				],
			},
		}),
	],
	define: {
		"import.meta.env.VERSION": JSON.stringify(packageJson.version),
	},
});
