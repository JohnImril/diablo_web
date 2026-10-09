// Optional interaction APIs may be absent, throw, return void (legacy Pointer
// Lock), or return a rejecting Promise. Invoke synchronously to keep activation.
export function runOptionalBrowserAction(action: () => void | Promise<void>): void {
	try {
		void Promise.resolve(action()).catch(() => {});
	} catch {
		// Continue with ordinary mouse/touch input when the browser denies it.
	}
}
