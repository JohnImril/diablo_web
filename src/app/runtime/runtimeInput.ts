import { createDomInput } from "../../modules/input/adapters";
import type { InputCommand, InputMods } from "../../modules/input";
import type { EngineInputContext } from "../../modules/engine/core/inputMapping";
import type { GameHandleLike } from "../../modules/engine/core/applyEngineIntent";
import { DIABLO, TOUCH, KEYS, MODS, MOUSE, BELT, PAN } from "../../constants/controls";
import type { ITouchOther } from "../../types";

type Ref<T> = { current: T };

export type RuntimeInputOptions = {
	getTarget?: () => Document | Window | HTMLElement | null;
	dispatchInput: (command: InputCommand) => void;
	setInputContext: (ctx: Partial<EngineInputContext>) => void;
	getGameHandle: () => GameHandleLike | null;
	setIsTouchMode: (value: boolean) => void;
	refs: {
		canvas: Ref<HTMLCanvasElement | null>;
		keyboard: Ref<HTMLInputElement | null>;
		element: Ref<HTMLElement | null>;
		showKeyboard: Ref<unknown>;
		maxKeyboard: Ref<number>;
		keyboardNum: Ref<number>;
		cursorPos: Ref<{ x: number; y: number }>;
		touchButtons: Ref<(HTMLDivElement | null)[]>;
		touchBelt: Ref<[number, number, number]>;
	};
};

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);
const FKEY_KEYCODES = Array.from({ length: 8 }, (_, i) => 112 + i);
const KEYDOWN_PREVENT_DEFAULT = new Set<number>([8, 9, ...FKEY_KEYCODES]);
const isFKeyButton = (idx: number) => idx >= TOUCH.BUTTON_START_FKEY_LEFT;

export function createRuntimeInputController(opts: RuntimeInputOptions) {
	const { refs } = opts;
	let touchControls = false;
	const touchMods: [boolean, boolean, boolean] = [false, false, false];
	let beltTime: number | undefined;
	let panPos: { x: number; y: number } | null = null;
	let activeTouch: ITouchOther | null = null;
	let secondaryTouch: { clientX: number; clientY: number } | null = null;

	const pointerLocked = () => document.pointerLockElement === refs.canvas.current;
	const mouseButtonMap = (button: number) => MOUSE.BUTTON_MAP[button] ?? MOUSE.BUTTON_MAP[0];

	opts.setInputContext({ mapMouseButton: mouseButtonMap });

	const getInputMods = (e: MouseEvent | KeyboardEvent | TouchEvent): InputMods => ({
		shift: (e as KeyboardEvent).shiftKey || touchMods[TOUCH.SHIFT],
		ctrl: (e as KeyboardEvent).ctrlKey,
		alt: (e as KeyboardEvent).altKey,
		meta: (e as KeyboardEvent).metaKey,
	});

	const getMousePos = (e: MouseEvent | { clientX: number; clientY: number } | null) => {
		const canvas = refs.canvas.current;
		if (!canvas) return { x: 0, y: 0 };
		const rect = canvas.getBoundingClientRect();

		if (e && "movementX" in e && pointerLocked()) {
			refs.cursorPos.current.x = clamp(refs.cursorPos.current.x + e.movementX, rect.left, rect.right);
			refs.cursorPos.current.y = clamp(refs.cursorPos.current.y + e.movementY, rect.top, rect.bottom);
		} else if (e) {
			refs.cursorPos.current.x = e.clientX;
			refs.cursorPos.current.y = e.clientY;
		}

		const x = Math.round(((refs.cursorPos.current.x - rect.left) / rect.width) * DIABLO.WIDTH);
		const y = Math.round(((refs.cursorPos.current.y - rect.top) / rect.height) * DIABLO.HEIGHT);

		return {
			x: clamp(x, 0, DIABLO.WIDTH - 1),
			y: clamp(y, 0, DIABLO.HEIGHT - 1),
		};
	};

	const getMods = (e: MouseEvent | KeyboardEvent | TouchEvent) =>
		((e as KeyboardEvent).shiftKey || touchMods[TOUCH.SHIFT] ? MODS.SHIFT : 0) +
		((e as KeyboardEvent).ctrlKey ? MODS.CTRL : 0) +
		((e as KeyboardEvent).altKey ? MODS.ALT : 0) +
		((e as TouchEvent).touches ? MODS.TOUCH : 0);

	const clearSelection = () => {
		if (refs.showKeyboard.current && refs.keyboard.current) {
			const len = refs.keyboard.current.value.length;
			refs.keyboard.current.setSelectionRange(len, len);
		}
	};

	const handleKeyboardInput = (blur: boolean) => {
		if (!refs.showKeyboard.current || !refs.keyboard.current) return;
		const text = refs.keyboard.current.value;
		let valid = "";
		if (refs.maxKeyboard.current > 0) {
			valid = (text.match(/[\x20-\x7E]/g) || []).join("").substring(0, refs.maxKeyboard.current);
		} else {
			const maxValue = -refs.maxKeyboard.current;
			if (/^\d*$/.test(text)) {
				refs.keyboardNum.current = Math.min(text.length ? parseInt(text, 10) : 0, maxValue);
			}
			valid = refs.keyboardNum.current ? refs.keyboardNum.current.toString() : "";
		}

		if (text !== valid && refs.keyboard.current) {
			refs.keyboard.current.value = valid;
		}
		clearSelection();
		opts.getGameHandle()?.("text", valid, blur ? 1 : 0);
	};

	const setTouchMod = (idx: number, down: boolean, useItem = false) => {
		const isModButton = idx < TOUCH.MOD_COUNT;
		const isBeltButton = idx >= TOUCH.BUTTON_START_BELT && idx < TOUCH.BUTTON_START_BELT + TOUCH.BELT_BUTTON_COUNT;

		if (isModButton) {
			touchMods[idx as 0 | 1 | 2] = down;
			refs.touchButtons.current[idx]?.classList.toggle("app__touch-button--active", down);
		} else if (useItem && isBeltButton) {
			const beltIndex = idx - TOUCH.BUTTON_START_BELT;
			const slot = refs.touchBelt.current[beltIndex];
			if (slot >= 0) {
				const now = performance.now();
				if (beltTime === undefined || now - beltTime > 750) {
					opts.getGameHandle()?.("DApi_Char", BELT.DIGIT_1_CHAR_CODE + slot);
					beltTime = now;
				}
			}
		}
	};

	const processTouches = (touches: TouchList, isRelease: boolean): boolean => {
		const game = opts.getGameHandle();
		if (!game) return false;
		const touchArray = Array.from(touches);

		if (!touchControls) {
			touchControls = true;
			opts.setIsTouchMode(true);
		}

		let newActive: ITouchOther | null = null;
		secondaryTouch = null;

		for (const t of touchArray) {
			const idx = refs.touchButtons.current.indexOf(t.target as HTMLDivElement);
			if (activeTouch?.id === t.identifier) {
				activeTouch.clientX = t.clientX;
				activeTouch.clientY = t.clientY;
				if (touches.length > 1) activeTouch.stick = false;

				const other = touchArray.find((x) => x.identifier !== t.identifier);
				if (other) secondaryTouch = { clientX: other.clientX, clientY: other.clientY };
				panPos = null;
				return secondaryTouch !== null;
			}
			if (idx >= 0 && !newActive) {
				newActive = {
					id: t.identifier,
					index: idx,
					stick: true,
					original: touchMods[idx as 0 | 1 | 2] ?? false,
					clientX: t.clientX,
					clientY: t.clientY,
				};
			}
		}

		if (isRelease && activeTouch && isFKeyButton(activeTouch.index)) {
			game("DApi_Key", 1, 0, KEYS.FKEY_BASE + activeTouch.index);
		}

		if (isRelease && activeTouch?.stick) {
			const btn = activeTouch;
			const rect = refs.touchButtons.current[btn.index]?.getBoundingClientRect();
			const inside =
				rect &&
				btn.clientX >= rect.left &&
				btn.clientX < rect.right &&
				btn.clientY >= rect.top &&
				btn.clientY < rect.bottom;
			setTouchMod(btn.index, inside ? !btn.original : btn.original, true);
		} else if (activeTouch && !isRelease) {
			setTouchMod(activeTouch.index, false);
		}

		activeTouch = newActive;

		if (newActive) {
			const i = newActive.index;
			if (!isFKeyButton(i)) {
				setTouchMod(i, true);
				if (i === TOUCH.MOVE) setTouchMod(TOUCH.RMB, false);
				if (i === TOUCH.RMB) setTouchMod(TOUCH.MOVE, false);
				panPos = null;
			} else {
				game("DApi_Key", 0, 0, KEYS.FKEY_BASE + i);
			}
		} else if (touches.length === 2) {
			const [t0, t1] = touchArray;
			const x = (t0.clientX + t1.clientX) / 2;
			const y = (t0.clientY + t1.clientY) / 2;
			if (panPos) {
				const dx = x - panPos.x;
				const dy = y - panPos.y;
				const step = (refs.canvas.current!.offsetHeight || 1) / PAN.STEP_DIVISOR;
				if (Math.hypot(dx, dy) > step) {
					const key =
						Math.abs(dx) > Math.abs(dy)
							? dx > 0
								? KEYS.ARROW_LEFT
								: KEYS.ARROW_RIGHT
							: dy > 0
								? KEYS.ARROW_UP
								: KEYS.ARROW_DOWN;
					game("DApi_Key", 0, 0, key);
					panPos = { x, y };
				}
			} else {
				game("DApi_Mouse", 0, 0, MODS.TOUCH_PAN, 320, 180);
				game("DApi_Mouse", 2, 1, MODS.TOUCH_PAN, 320, 180);
				panPos = { x, y };
			}
			return false;
		} else {
			panPos = null;
		}

		const other = touchArray.find((t) => t.identifier !== newActive?.id);
		if (other) secondaryTouch = { clientX: other.clientX, clientY: other.clientY };
		return secondaryTouch !== null;
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (!opts.getGameHandle()) return;
		const { x, y } = getMousePos(e);
		opts.setInputContext({
			mousePosition: { x, y, buttons: e.buttons, mods: getInputMods(e) },
		});
		e.preventDefault();
	};

	const handleMouseDown = (e: MouseEvent) => {
		if (!opts.getGameHandle()) return;
		if (!refs.canvas.current || e.target === refs.keyboard.current) return;
		if (touchControls) {
			touchControls = false;
			opts.setIsTouchMode(false);
		}
		if (!pointerLocked() && window.innerHeight === screen.height) {
			refs.canvas.current.requestPointerLock();
		}
		const { x, y } = getMousePos(e);
		opts.setInputContext({
			mousePosition: { x, y, buttons: e.buttons, mods: getInputMods(e) },
		});
		e.preventDefault();
	};

	const handleMouseUp = (e: MouseEvent) => {
		if (!opts.getGameHandle()) return;
		const { x, y } = getMousePos(e);
		opts.setInputContext({
			mousePosition: { x, y, buttons: e.buttons, mods: getInputMods(e) },
		});
		if (e.target !== refs.keyboard.current) e.preventDefault();
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		const game = opts.getGameHandle();
		if (!game) return;
		if (!refs.showKeyboard.current && e.key.length === 1) game("DApi_Char", e.key.charCodeAt(0));
		if ([8, 13].includes(e.keyCode)) game("DApi_Char", e.keyCode);
		clearSelection();
		if (!refs.showKeyboard.current && KEYDOWN_PREVENT_DEFAULT.has(e.keyCode)) {
			e.preventDefault();
		}
	};

	const handleKeyUp = () => {
		if (!opts.getGameHandle()) return;
		clearSelection();
	};

	const handleTouchStart = (e: TouchEvent) => {
		const game = opts.getGameHandle();
		if (!game) return;
		if (!refs.canvas.current || e.target === refs.keyboard.current) return;
		refs.keyboard.current?.blur();
		e.preventDefault();

		if (processTouches(e.touches, false) && secondaryTouch) {
			const { x, y } = getMousePos(secondaryTouch);
			game("DApi_Mouse", 0, 0, getMods(e), x, y);
			if (!touchMods[TOUCH.MOVE]) {
				const btn = touchMods[TOUCH.RMB] ? MOUSE.BUTTON_MAP[2] : MOUSE.BUTTON_MAP[0];
				game("DApi_Mouse", 1, btn, getMods(e), x, y);
			}
		}
	};

	const handleTouchMove = (e: TouchEvent) => {
		const game = opts.getGameHandle();
		if (!game) return;
		if (!refs.canvas.current) return;
		e.preventDefault();

		if (processTouches(e.touches, false) && secondaryTouch) {
			const { x, y } = getMousePos(secondaryTouch);
			game("DApi_Mouse", 0, 0, getMods(e), x, y);
		}
	};

	const handleTouchEnd = (e: TouchEvent) => {
		const game = opts.getGameHandle();
		if (!game) return;
		if (!refs.canvas.current) return;
		e.preventDefault();
		const lastSecondary = secondaryTouch && { ...secondaryTouch };
		const hadSecondary = !!lastSecondary;
		processTouches(e.touches, true);
		if (hadSecondary && !secondaryTouch && lastSecondary) {
			const { x, y } = getMousePos(lastSecondary);
			const leftButton = MOUSE.BUTTON_MAP[0];
			const rightButton = MOUSE.BUTTON_MAP[2];

			game("DApi_Mouse", 2, leftButton, getMods(e), x, y);
			game("DApi_Mouse", 2, rightButton, getMods(e), x, y);
			if (touchMods[TOUCH.RMB] && (!activeTouch || activeTouch.index !== TOUCH.RMB)) {
				setTouchMod(TOUCH.RMB, false);
			}
		}
		if (!document.fullscreenElement) refs.element.current?.requestFullscreen();
	};

	const handleContextMenu = (e: MouseEvent) => e.preventDefault();

	const handlePointerLockChange = () => {
		const game = opts.getGameHandle();
		if (!game) return;
		if (!pointerLocked() && window.innerHeight === screen.height) {
			game("DApi_Key", 0, 0, KEYS.ESC);
			game("DApi_Key", 1, 0, KEYS.ESC);
		}
	};

	const handleResize = () => {
		document.exitPointerLock();
	};

	const domInput = createDomInput({
		getTarget: opts.getTarget ?? (() => document),
		callbacks: {
			onMouseMove: handleMouseMove,
			onMouseDown: handleMouseDown,
			onMouseUp: handleMouseUp,
			onKeyDown: handleKeyDown,
			onKeyUp: handleKeyUp,
			onTouchStart: handleTouchStart,
			onTouchMove: handleTouchMove,
			onTouchEnd: handleTouchEnd,
			onContextMenu: handleContextMenu,
			onPointerLockChange: handlePointerLockChange,
			onResize: handleResize,
		},
		onCommand: (command) => opts.dispatchInput(command),
	});

	const start = () => domInput.start();
	const stop = () => domInput.stop();

	const dispose = () => {
		stop();
	};

	return {
		start,
		stop,
		dispose,
		handleKeyboardInput,
	};
}

type FileDropHandlers = {
	onDropFile: (file: File) => void;
	onDroppingChange?: (count: number) => void;
};

export function attachFileDrop({ onDropFile, onDroppingChange }: FileDropHandlers): () => void {
	let dropping = 0;

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		const file = getDropFile(e);
		if (!file) return;
		onDropFile(file);
		dropping = 0;
		onDroppingChange?.(dropping);
	};

	const handleDragOver = (e: DragEvent) => {
		if (isDropFile(e)) e.preventDefault();
	};

	const handleDragEnter = (e: DragEvent) => {
		if (!isDropFile(e)) return;
		e.preventDefault();
		dropping = Math.max(dropping + 1, 0);
		onDroppingChange?.(dropping);
	};

	const handleDragLeave = (e: DragEvent) => {
		if (!isDropFile(e)) return;
		dropping = Math.max(dropping - 1, 0);
		onDroppingChange?.(dropping);
	};

	document.addEventListener("drop", handleDrop, true);
	document.addEventListener("dragover", handleDragOver, true);
	document.addEventListener("dragenter", handleDragEnter, true);
	document.addEventListener("dragleave", handleDragLeave, true);

	return () => {
		document.removeEventListener("drop", handleDrop, true);
		document.removeEventListener("dragover", handleDragOver, true);
		document.removeEventListener("dragenter", handleDragEnter, true);
		document.removeEventListener("dragleave", handleDragLeave, true);
	};
}

export function ensureTouchBeltCanvases(
	touchButtons: { current: (HTMLDivElement | null)[] },
	touchCtx: { current: (CanvasRenderingContext2D | null)[] }
): void {
	for (const slotIdx of TOUCH.BELT_SLOTS) {
		const buttonIndex = TOUCH.BUTTON_START_BELT + slotIdx;
		const el = touchButtons.current[buttonIndex];
		if (!el || touchCtx.current[slotIdx]) continue;
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = BELT.ICON_SIZE;
		el.appendChild(canvas);
		touchCtx.current[slotIdx] = canvas.getContext("2d");
	}
}

function isDropFile(e: DragEvent) {
	if (e.dataTransfer?.items) {
		return Array.from(e.dataTransfer.items).some((item) => item.kind === "file");
	}
	return !!e.dataTransfer?.files?.length;
}

function getDropFile(e: DragEvent) {
	if (e.dataTransfer?.items) {
		for (const item of e.dataTransfer.items) {
			if (item.kind === "file") {
				return item.getAsFile();
			}
		}
	}
	return e.dataTransfer?.files[0] || null;
}
