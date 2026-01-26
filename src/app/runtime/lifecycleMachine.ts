import type { LifecycleState } from "./runtimeState";

export type LifecycleEvent = "START" | "LOADED" | "RUN" | "FAIL" | "EXIT" | "RESET";

export function transition(state: LifecycleState, event: LifecycleEvent): LifecycleState {
	switch (event) {
		case "START":
			return "loading";
		case "LOADED":
			return "ready";
		case "RUN":
			return "running";
		case "FAIL":
			return "error";
		case "EXIT":
			return "exited";
		case "RESET":
			return "idle";
		default:
			return state;
	}
}
