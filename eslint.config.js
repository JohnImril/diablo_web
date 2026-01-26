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
			reactHooks.configs.flat["recommended-latest"],
			reactRefresh.configs.vite,
		],
		languageOptions: {
			ecmaVersion: 2020,
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
						"**/adapters/**",
						"src/app/runtime/**",
						"src/app/ui/**",
						"src/app/uiHooks/**",
						"src/components/**",
						"src/App.tsx",
					],
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
					patterns: ["src/modules/**"],
				},
			],
		},
	},
]);
