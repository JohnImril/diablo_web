import type { CSSProperties } from "react";

import { BELT, DIABLO, TOUCH } from "../../constants/controls";
import type { GameFunction, IApi, IFileSystem } from "../../types";

type Ref<T> = { current: T };

export type UiApiOptions = {
	fs: Promise<IFileSystem>;
	canvasRef: Ref<HTMLCanvasElement | null>;
	keyboardRef: Ref<HTMLInputElement | null>;
	cursorPosRef: Ref<{ x: number; y: number }>;
	showKeyboardRef: Ref<CSSProperties | null>;
	maxKeyboardRef: Ref<number>;
	keyboardNumRef: Ref<number>;
	touchButtonsRef: Ref<(HTMLDivElement | null)[]>;
	touchCtxRef: Ref<(CanvasRenderingContext2D | null)[]>;
	touchBeltRef: Ref<[number, number, number]>;
	setKeyboardStyle: (style: CSSProperties | null) => void;
	onError: (message: string, stack?: string) => void;
	onProgress: (progress: { text: string; loaded: number; total: number }) => void;
	onExit: () => void;
	setCurrentSave: (name: string) => void;
};

type UiApiRuntimeOptions = UiApiOptions & {
	getGameHandle: () => GameFunction | null;
};

export function createUiApi({
	fs,
	canvasRef,
	keyboardRef,
	cursorPosRef,
	showKeyboardRef,
	maxKeyboardRef,
	keyboardNumRef,
	touchButtonsRef,
	touchCtxRef,
	touchBeltRef,
	setKeyboardStyle,
	onError,
	onProgress,
	onExit,
	setCurrentSave,
	getGameHandle,
}: UiApiRuntimeOptions): IApi {
	const updateBelt = (belt: number[]) => {
		const game = getGameHandle();
		if (!game) return;
		const canvas = canvasRef.current;
		if (!canvas) return;

		const drawSlot = (index: number, slot: number) => {
			const buttonIndex = TOUCH.BUTTON_START_BELT + index;
			const btn = touchButtonsRef.current[buttonIndex];
			const ctx = touchCtxRef.current[index];
			if (!btn) return;

			touchBeltRef.current[index] = slot;

			if (slot >= 0 && ctx) {
				btn.style.display = "block";
				ctx.clearRect(0, 0, BELT.ICON_SIZE, BELT.ICON_SIZE);
				ctx.drawImage(
					canvas,
					BELT.START_X + BELT.SLOT_STEP * slot,
					BELT.START_Y,
					BELT.ICON_SIZE,
					BELT.ICON_SIZE,
					0,
					0,
					BELT.ICON_SIZE,
					BELT.ICON_SIZE
				);
			} else {
				btn.style.display = "none";
			}
		};

		if (!belt) {
			TOUCH.BELT_SLOTS.forEach((i) => drawSlot(i, -1));
			return;
		}
		const used = new Set<number>();
		let pos = 0;
		for (let i = 0; i < belt.length && pos < TOUCH.BELT_SLOTS.length; i++) {
			if (belt[i] >= 0 && !used.has(belt[i])) {
				drawSlot(pos++, i);
				used.add(belt[i]);
			}
		}
		while (pos < TOUCH.BELT_SLOTS.length) drawSlot(pos++, -1);
	};

	const setCursorPos = (x: number, y: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		cursorPosRef.current = {
			x: rect.left + (rect.width * x) / DIABLO.WIDTH,
			y: rect.top + (rect.height * y) / DIABLO.HEIGHT,
		};
		setTimeout(() => {
			const game = getGameHandle();
			if (!game) return;
			game("DApi_Mouse", 0, 0, 0, x, y);
		});
	};

	const openKeyboard = (rect: number[] | null) => {
		const game = getGameHandle();
		if (!game) return;
		const keyboard = keyboardRef.current;
		if (rect && keyboard) {
			const style: CSSProperties = {
				left: `${((100 * (rect[0] - 10)) / DIABLO.WIDTH).toFixed(2)}%`,
				top: `${((100 * (rect[1] - 10)) / DIABLO.HEIGHT).toFixed(2)}%`,
				width: `${((100 * (rect[2] - rect[0] + 20)) / DIABLO.WIDTH).toFixed(2)}%`,
				height: `${((100 * (rect[3] - rect[1] + 20)) / DIABLO.HEIGHT).toFixed(2)}%`,
			};
			showKeyboardRef.current = style;
			setKeyboardStyle(style);
			maxKeyboardRef.current = rect[4];
			Object.assign(keyboard.style, style);
			keyboard.focus();
		} else {
			showKeyboardRef.current = null;
			setKeyboardStyle(null);
			keyboard?.blur();
			if (keyboard) keyboard.value = "";
			keyboardNumRef.current = 0;
		}
	};

	return {
		updateBelt,
		canvas: canvasRef.current!,
		fs,
		setCursorPos,
		openKeyboard,
		onError,
		onProgress,
		onExit,
		setCurrentSave,
	};
}
