const DEFAULT_WS_URL = "ws://127.0.0.1:8787/ws";

const isLocalhost = (hostname?: string) =>
	hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

const logConfigError = (message: string, details?: Record<string, unknown>) => {
	if (details) {
		console.error(`[ws-config] ${message}`, details);
	} else {
		console.error(`[ws-config] ${message}`);
	}
};

export function resolveWsUrl(): string {
	const envUrl = import.meta.env.VITE_WS_URL?.trim();
	const location = globalThis.location;
	const hostname = location?.hostname;
	const protocol = location?.protocol;

	if (!envUrl) {
		if (import.meta.env.DEV || isLocalhost(hostname)) {
			return DEFAULT_WS_URL;
		}

		const message = "VITE_WS_URL is required in production build";
		logConfigError(message, { mode: import.meta.env.MODE, hostname, protocol });
		throw new Error(message);
	}

	let parsed: URL;
	try {
		parsed = new URL(envUrl);
	} catch (error) {
		const message = "VITE_WS_URL is not a valid URL";
		logConfigError(message, { value: envUrl, error });
		throw new Error(message);
	}

	if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
		const message = "VITE_WS_URL must use ws:// or wss://";
		logConfigError(message, { value: envUrl });
		throw new Error(message);
	}

	if (protocol === "https:" && parsed.protocol === "ws:") {
		const message = "Insecure WebSocket URL (ws://) is not allowed on https pages";
		logConfigError(message, { value: envUrl, protocol });
		throw new Error(message);
	}

	if (import.meta.env.PROD && parsed.protocol === "ws:") {
		const message = "Insecure WebSocket URL (ws://) is not allowed in production builds";
		logConfigError(message, { value: envUrl, mode: import.meta.env.MODE });
		throw new Error(message);
	}

	return parsed.toString();
}
