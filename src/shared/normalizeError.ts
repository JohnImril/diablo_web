export type NormalizedError = { name: string; message: string; stack?: string; details?: string };

// Worker messages and Emscripten exceptions are not necessarily Error instances.
export function normalizeError(value: unknown): NormalizedError {
	const serialize = (input: unknown): string => {
		const seen = new WeakSet<object>();
		try {
			return (
				JSON.stringify(
					input,
					(_key, item) => {
						if (typeof item === "bigint") return String(item);
						if (item && typeof item === "object") {
							if (seen.has(item)) return "[Circular]";
							seen.add(item);
							if (item instanceof Error)
								return { name: item.name, message: item.message, stack: item.stack, cause: item.cause };
						}
						return item;
					},
					2
				) ?? String(input)
			);
		} catch {
			return "Unable to serialize thrown value";
		}
	};
	if (value && typeof value === "object") {
		const object = value as Record<string, unknown>;
		const name = typeof object.name === "string" ? object.name : value.constructor?.name || "Error";
		const message = typeof object.message === "string" && object.message ? object.message : serialize(value);
		return {
			name,
			message,
			stack: typeof object.stack === "string" ? object.stack : undefined,
			details: serialize(value),
		};
	}
	return { name: "Error", message: String(value) };
}
