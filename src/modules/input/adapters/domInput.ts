import type { InputCommand, InputMods } from "../core/commands";

export type DomInputCallbacks = {
	onMouseMove?: (event: MouseEvent) => void;
	onMouseDown?: (event: MouseEvent) => void;
	onMouseUp?: (event: MouseEvent) => void;
	onKeyDown?: (event: KeyboardEvent) => void;
	onKeyUp?: (event: KeyboardEvent) => void;
	onTouchStart?: (event: TouchEvent) => void;
	onTouchMove?: (event: TouchEvent) => void;
	onTouchEnd?: (event: TouchEvent) => void;
	onContextMenu?: (event: MouseEvent) => void;
	onPointerLockChange?: (event: Event) => void;
	onResize?: (event: UIEvent) => void;
};

export type DomInputOptions = {
	target?: Document | Window | HTMLElement;
	getTarget?: () => Document | Window | HTMLElement | null;
	callbacks: DomInputCallbacks;
	onCommand?: (command: InputCommand) => void;
};

type ResolvedTarget = {
	doc: Document;
	win: Window;
};

const resolveTarget = (target: Document | Window | HTMLElement | null | undefined): ResolvedTarget | null => {
	if (!target) return null;
	if (target instanceof Window) {
		return { doc: target.document, win: target };
	}
	if (target instanceof Document) {
		return { doc: target, win: target.defaultView ?? window };
	}
	const doc = target.ownerDocument;
	return { doc, win: doc.defaultView ?? window };
};

const toMods = (event: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): InputMods => ({
	shift: event.shiftKey,
	ctrl: event.ctrlKey,
	alt: event.altKey,
	meta: event.metaKey,
});

const toTouches = (touches: TouchList) =>
	Array.from(touches, (touch) => ({
		id: touch.identifier,
		x: touch.clientX,
		y: touch.clientY,
	}));

export function createDomInput(opts: DomInputOptions) {
	let enabled = true;
	let active = false;
	let currentTarget: ResolvedTarget | null = null;

	const touchOptions = { passive: false, capture: true } as const;

	const runIfEnabled = <TEvent>(handler: ((event: TEvent) => void) | undefined) => {
		return (event: TEvent) => {
			if (!enabled) return;
			handler?.(event);
		};
	};

	const onMouseMove = runIfEnabled((event: MouseEvent) => {
		opts.callbacks.onMouseMove?.(event);
		opts.onCommand?.({
			type: "MouseMove",
			x: event.clientX,
			y: event.clientY,
			buttons: event.buttons,
			mods: toMods(event),
		});
	});
	const onMouseDown = runIfEnabled((event: MouseEvent) => {
		opts.callbacks.onMouseDown?.(event);
		opts.onCommand?.({
			type: "MouseDown",
			button: event.button,
			x: event.clientX,
			y: event.clientY,
			mods: toMods(event),
		});
	});
	const onMouseUp = runIfEnabled((event: MouseEvent) => {
		opts.callbacks.onMouseUp?.(event);
		opts.onCommand?.({
			type: "MouseUp",
			button: event.button,
			x: event.clientX,
			y: event.clientY,
			mods: toMods(event),
		});
	});
	const onKeyDown = runIfEnabled((event: KeyboardEvent) => {
		opts.callbacks.onKeyDown?.(event);
		opts.onCommand?.({
			type: "KeyDown",
			code: event.code,
			key: event.key,
			keyCode: event.keyCode,
			repeat: event.repeat,
			mods: toMods(event),
		});
	});
	const onKeyUp = runIfEnabled((event: KeyboardEvent) => {
		opts.callbacks.onKeyUp?.(event);
		opts.onCommand?.({
			type: "KeyUp",
			code: event.code,
			key: event.key,
			keyCode: event.keyCode,
			repeat: event.repeat,
			mods: toMods(event),
		});
	});
	const onTouchStart = runIfEnabled((event: TouchEvent) => {
		opts.callbacks.onTouchStart?.(event);
		opts.onCommand?.({
			type: "TouchStart",
			touches: toTouches(event.touches),
			mods: toMods(event),
		});
	});
	const onTouchMove = runIfEnabled((event: TouchEvent) => {
		opts.callbacks.onTouchMove?.(event);
		opts.onCommand?.({
			type: "TouchMove",
			touches: toTouches(event.touches),
			mods: toMods(event),
		});
	});
	const onTouchEnd = runIfEnabled((event: TouchEvent) => {
		opts.callbacks.onTouchEnd?.(event);
		opts.onCommand?.({
			type: "TouchEnd",
			touches: toTouches(event.touches),
			mods: toMods(event),
		});
	});
	const onContextMenu = runIfEnabled(opts.callbacks.onContextMenu);
	const onPointerLockChange = runIfEnabled(opts.callbacks.onPointerLockChange);
	const onResize = runIfEnabled(opts.callbacks.onResize);

	const start = () => {
		if (active) return;
		const resolved = resolveTarget(opts.getTarget?.() ?? opts.target);
		if (!resolved) return;
		currentTarget = resolved;
		active = true;

		const { doc, win } = resolved;
		doc.addEventListener("mousemove", onMouseMove, true);
		doc.addEventListener("mousedown", onMouseDown, true);
		doc.addEventListener("mouseup", onMouseUp, true);
		doc.addEventListener("keydown", onKeyDown, true);
		doc.addEventListener("keyup", onKeyUp, true);
		doc.addEventListener("contextmenu", onContextMenu, true);
		doc.addEventListener("touchstart", onTouchStart, touchOptions);
		doc.addEventListener("touchmove", onTouchMove, touchOptions);
		doc.addEventListener("touchend", onTouchEnd, touchOptions);
		doc.addEventListener("pointerlockchange", onPointerLockChange);
		win.addEventListener("resize", onResize);
	};

	const stop = () => {
		if (!active || !currentTarget) return;
		const { doc, win } = currentTarget;
		doc.removeEventListener("mousemove", onMouseMove, true);
		doc.removeEventListener("mousedown", onMouseDown, true);
		doc.removeEventListener("mouseup", onMouseUp, true);
		doc.removeEventListener("keydown", onKeyDown, true);
		doc.removeEventListener("keyup", onKeyUp, true);
		doc.removeEventListener("contextmenu", onContextMenu, true);
		doc.removeEventListener("touchstart", onTouchStart, touchOptions);
		doc.removeEventListener("touchmove", onTouchMove, touchOptions);
		doc.removeEventListener("touchend", onTouchEnd, touchOptions);
		doc.removeEventListener("pointerlockchange", onPointerLockChange);
		win.removeEventListener("resize", onResize);
		active = false;
		currentTarget = null;
	};

	const setEnabled = (next: boolean) => {
		enabled = next;
	};

	const setTarget = (next: Document | Window | HTMLElement | null) => {
		opts.target = next ?? undefined;
		if (!active) return;
		stop();
		start();
	};

	return { start, stop, setEnabled, setTarget };
}
