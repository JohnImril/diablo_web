export const DIABLO = {
	// Original Diablo canvas size
	WIDTH: 640,
	HEIGHT: 480,
} as const;

// Touch UI indices & layout
export const TOUCH = {
	// Modifier buttons (touch UI)
	MOVE: 0,
	RMB: 1,
	SHIFT: 2,

	// How many "mod" buttons exist (MOVE, RMB, SHIFT)
	MOD_COUNT: 3,

	// Total number of touch buttons (mods + belt + F-keys)
	BUTTON_TOTAL: 10,

	// Belt buttons: indices 3, 4, 5
	BUTTON_START_BELT: 3,
	BELT_BUTTON_COUNT: 3,

	// Left F-keys: 6, 7
	BUTTON_START_FKEY_LEFT: 6,
	FKEY_LEFT_COUNT: 2,

	// Right F-keys: 8, 9
	BUTTON_START_FKEY_RIGHT: 8,
	FKEY_RIGHT_COUNT: 2,

	// Explicit index arrays
	MOD_INDICES: [0, 1, 2] as const,
	BELT_SLOTS: [0, 1, 2] as const,
	FKEY_LEFT_INDICES: [6, 7] as const,
	FKEY_RIGHT_INDICES: [8, 9] as const,
} as const;

// Keyboard key codes
export const KEYS = {
	ESC: 27,
	ARROW_LEFT: 0x25,
	ARROW_UP: 0x26,
	ARROW_RIGHT: 0x27,
	ARROW_DOWN: 0x28,

	// Base for function keys from touch UI
	FKEY_BASE: 110,
} as const;

// Modifier bit flags for DApi_* calls
export const MODS = {
	SHIFT: 1,
	CTRL: 2,
	ALT: 4,
	TOUCH: 8,

	// Special touch-pan modifier
	TOUCH_PAN: 24,
} as const;

// Mouse button mapping
export const MOUSE = {
	BUTTON_MAP: [1, 4, 2, 5, 6] as const,
} as const;

// Belt icon rendering geometry
export const BELT = {
	ICON_SIZE: 28,
	START_X: 205,
	START_Y: 357,
	SLOT_STEP: 29,

	// "1" charcode for belt activation
	DIGIT_1_CHAR_CODE: 49,
} as const;

// Touch panning config
export const PAN = {
	STEP_DIVISOR: 12,
} as const;
