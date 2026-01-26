import type { InputCommand, InputMods } from "../../input/core/commands";

export type EngineIntent =
	| { kind: "call"; name: "DApi_Key"; args: [number, number, number] }
	| { kind: "call"; name: "DApi_Mouse"; args: [number, number, number, number, number] }
	| { kind: "call"; name: "DApi_Char"; args: [number] };

export type EngineInputContext = {
	isTouchMode: boolean;
	isRetail?: boolean;
	modifiers?: InputMods;
	mapMouseButton?: (button: number) => number;
	mousePosition?: {
		x: number;
		y: number;
		buttons: number;
		mods: InputMods;
	};
};

const resolveMods = (mods: InputMods | undefined): number => {
	if (!mods) return 0;
	return (mods.shift ? 1 : 0) + (mods.ctrl ? 2 : 0) + (mods.alt ? 4 : 0);
};

const resolveMoveKind = (type: "MouseMove" | "TouchMove") => (type === "MouseMove" ? 0 : 0);

export function mapInputToEngine(cmd: InputCommand, ctx: EngineInputContext): EngineIntent {
	const mods = resolveMods(cmd.mods ?? ctx.modifiers);
	switch (cmd.type) {
		case "KeyDown":
			return { kind: "call", name: "DApi_Key", args: [0, mods, cmd.keyCode] };
		case "KeyUp":
			return { kind: "call", name: "DApi_Key", args: [1, mods, cmd.keyCode] };
		case "MouseMove":
			return {
				kind: "call",
				name: "DApi_Mouse",
				args: [
					resolveMoveKind(cmd.type),
					0,
					resolveMods(ctx.mousePosition?.mods ?? cmd.mods ?? ctx.modifiers),
					ctx.mousePosition?.x ?? cmd.x,
					ctx.mousePosition?.y ?? cmd.y,
				],
			};
		case "MouseDown":
			return {
				kind: "call",
				name: "DApi_Mouse",
				args: [
					1,
					ctx.mapMouseButton ? ctx.mapMouseButton(cmd.button) : cmd.button,
					resolveMods(ctx.mousePosition?.mods ?? cmd.mods ?? ctx.modifiers),
					ctx.mousePosition?.x ?? cmd.x,
					ctx.mousePosition?.y ?? cmd.y,
				],
			};
		case "MouseUp":
			return {
				kind: "call",
				name: "DApi_Mouse",
				args: [
					2,
					ctx.mapMouseButton ? ctx.mapMouseButton(cmd.button) : cmd.button,
					resolveMods(ctx.mousePosition?.mods ?? cmd.mods ?? ctx.modifiers),
					ctx.mousePosition?.x ?? cmd.x,
					ctx.mousePosition?.y ?? cmd.y,
				],
			};
		case "TouchStart":
		case "TouchMove":
		case "TouchEnd":
			return { kind: "call", name: "DApi_Mouse", args: [0, 0, mods, 0, 0] };
		default:
			return { kind: "call", name: "DApi_Key", args: [0, mods, 0] };
	}
}
