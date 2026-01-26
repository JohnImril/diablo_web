import { useEffect, type RefObject } from "react";

import { ensureTouchBeltCanvases } from "../runtime/runtimeInput";

export const useTouchControls = (
	enabled: boolean,
	touchButtons: RefObject<(HTMLDivElement | null)[]>,
	touchCtx: RefObject<(CanvasRenderingContext2D | null)[]>
) => {
	useEffect(() => {
		if (!enabled) return;
		ensureTouchBeltCanvases(touchButtons, touchCtx);
	}, [enabled, touchButtons, touchCtx]);
};
