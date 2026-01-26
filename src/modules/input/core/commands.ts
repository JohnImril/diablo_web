export type InputMods = {
	shift: boolean;
	ctrl: boolean;
	alt: boolean;
	meta: boolean;
};

export type InputCommand =
	| {
			type: "KeyDown";
			code: string;
			key: string;
			keyCode: number;
			repeat: boolean;
			mods: InputMods;
	  }
	| {
			type: "KeyUp";
			code: string;
			key: string;
			keyCode: number;
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
