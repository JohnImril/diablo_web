import type { EngineIntent } from "./inputMapping";

export type GameHandleLike = (command: string, ...args: (string | number)[]) => void;

export function applyEngineIntent(game: GameHandleLike, intent: EngineIntent): void {
	switch (intent.kind) {
		case "call":
			game(intent.name, ...intent.args);
			break;
		default:
	}
}
