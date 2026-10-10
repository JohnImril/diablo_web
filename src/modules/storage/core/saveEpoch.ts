/** Save epochs are explicit, monotonically increasing decimal generations. */
export function shouldResetSaves(previous: string | number, current: string): boolean {
	const parse = (value: string | number) => {
		const text = String(value);
		if (!/^(0|[1-9]\d*)$/.test(text)) throw new Error("Save data epoch must be a non-negative decimal integer.");
		return BigInt(text);
	};
	const stored = parse(previous);
	const requested = parse(current);
	if (requested < stored) {
		throw new Error(
			"This build uses an older save data epoch. Open a compatible newer build to access your saves."
		);
	}
	return requested > stored;
}
