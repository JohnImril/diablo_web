export type InputMods = {
	shift: boolean;
	ctrl: boolean;
	alt: boolean;
	meta: boolean;
};

const LEGACY_KEY_CODES: Readonly<Record<string, number>> = {
	Backspace: 8,
	Tab: 9,
	Enter: 13,
	ShiftLeft: 16,
	ShiftRight: 16,
	ControlLeft: 17,
	ControlRight: 17,
	AltLeft: 18,
	AltRight: 18,
	Pause: 19,
	CapsLock: 20,
	Escape: 27,
	Space: 32,
	PageUp: 33,
	PageDown: 34,
	End: 35,
	Home: 36,
	ArrowLeft: 37,
	ArrowUp: 38,
	ArrowRight: 39,
	ArrowDown: 40,
	Insert: 45,
	Delete: 46,
	MetaLeft: 91,
	MetaRight: 92,
	ContextMenu: 93,
	NumpadMultiply: 106,
	NumpadAdd: 107,
	NumpadSubtract: 109,
	NumpadDecimal: 110,
	NumpadDivide: 111,
	NumLock: 144,
	ScrollLock: 145,
	Semicolon: 186,
	Equal: 187,
	Comma: 188,
	Minus: 189,
	Period: 190,
	Slash: 191,
	Backquote: 192,
	BracketLeft: 219,
	Backslash: 220,
	BracketRight: 221,
	Quote: 222,
};

/** Converts the standard KeyboardEvent.code value to the virtual-key value expected by the engine protocol. */
export function toEngineKeyCode(code: string): number {
	if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
	if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
	if (/^Numpad[0-9]$/.test(code)) return 96 + Number(code.slice(6));
	const functionKey = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
	if (functionKey) return 111 + Number(functionKey[1]);
	return LEGACY_KEY_CODES[code] ?? 0;
}

export type InputCommand =
	| {
			type: "KeyDown";
			code: string;
			key: string;
			engineKeyCode: number;
			repeat: boolean;
			mods: InputMods;
	  }
	| {
			type: "KeyUp";
			code: string;
			key: string;
			engineKeyCode: number;
			repeat: boolean;
			mods: InputMods;
	  }
	| {
			type: "MouseMove";
			x: number;
			y: number;
			buttons: number;
			mods: InputMods;
	  }
	| {
			type: "MouseDown";
			button: number;
			x: number;
			y: number;
			mods: InputMods;
	  }
	| {
			type: "MouseUp";
			button: number;
			x: number;
			y: number;
			mods: InputMods;
	  }
	| {
			type: "TouchStart";
			touches: Array<{ id: number; x: number; y: number }>;
			mods: InputMods;
	  }
	| {
			type: "TouchMove";
			touches: Array<{ id: number; x: number; y: number }>;
			mods: InputMods;
	  }
	| {
			type: "TouchEnd";
			touches: Array<{ id: number; x: number; y: number }>;
			mods: InputMods;
	  };
