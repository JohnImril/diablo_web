type LegacyModule<T> = T & { ready: Promise<T> };
type EmscriptenFactory<T, O> = (options: O) => LegacyModule<T> | Promise<T>;

export async function loadEmscriptenModule<T, O>(factory: EmscriptenFactory<T, O>, options: O): Promise<T> {
	const moduleOrPromise = factory(options);
	if (moduleOrPromise instanceof Promise) {
		return moduleOrPromise;
	}
	return moduleOrPromise.ready;
}

