import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
	globalIgnores(["dist", "dev-dist"]),
	{
		files: ["**/*.{ts,tsx}"],
		extends: [
			js.configs.recommended,
			tseslint.configs.recommended,
			reactHooks.configs.flat.recommended,
			reactRefresh.configs.vite,
		],
		languageOptions: {
			ecmaVersion: "latest",
			globals: globals.browser,
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "warn",
		},
	},
	{
		files: ["src/modules/**/core/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						"modules/**/adapters/**",
						"**/adapters/**",
						"app/**",
						"src/app/runtime/**",
						"**/app/runtime/**",
						"src/app/ui/**",
						"**/app/ui/**",
						"src/app/uiHooks/**",
						"**/app/uiHooks/**",
						"src/components/**",
						"**/components/**",
						"src/App.tsx",
					],
				},
			],
		},
	},
	{
		files: ["src/modules/**/adapters/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: ["app/**", "**/app/**", "components/**", "**/components/**", "**/App.tsx"],
				},
			],
		},
	},
	{
		files: ["src/app/runtime/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: ["app/ui/**", "app/uiHooks/**", "components/**", "**/components/**", "**/App.tsx"],
				},
			],
		},
	},
	{
		files: [
			"src/App.tsx",
			"src/app/ui/**/*.{ts,tsx}",
			"src/app/uiHooks/**/*.{ts,tsx}",
			"src/components/**/*.{ts,tsx}",
		],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: ["src/modules/**", "modules/**", "**/modules/**"],
				},
			],
		},
	},
]);
