import { useEffect } from "react";

import { ensureTouchBeltCanvases } from "../runtime/runtimeInput";

type Ref<T> = { current: T };

export const useTouchControls = (
	enabled: boolean,
	touchButtons: Ref<(HTMLDivElement | null)[]>,
	touchCtx: Ref<(CanvasRenderingContext2D | null)[]>
) => {
	useEffect(() => {
		if (!enabled) return;
		ensureTouchBeltCanvases(touchButtons, touchCtx);
	}, [enabled, touchButtons, touchCtx]);
};
