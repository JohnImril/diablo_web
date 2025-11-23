import { useState, useRef, useCallback, useEffect, lazy, Suspense, type CSSProperties } from "react";
import cn from "classnames";

import load_game from "./api/loader";
import LoadingComponent from "./components/LoadingComponent/LoadingComponent";
import StartScreen from "./components/StartScreen/StartScreen";
import { useErrorHandling, useFileDrop, useInitFSAndSaves } from "./hooks";
import { DIABLO, TOUCH, KEYS, MODS, MOUSE, BELT, PAN } from "./constants/controls";
import type { GameFunction, IPlayerInfo, IProgress, ITouchOther } from "./types";

import "./base.css";
import "./App.css";

const SaveList = lazy(() => import("./components/SaveList/SaveList"));
const CompressMpq = lazy(() => import("./mpqcmp/CompressMpq"));
const ErrorComponent = lazy(() => import("./components/ErrorComponent/ErrorComponent"));

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

const App = () => {
	const [started, setStarted] = useState(false);
	const [loading, setLoading] = useState(false);
	const [progress, setProgress] = useState<IProgress | undefined>(undefined);
	const [showSaves, setShowSaves] = useState(false);
	const [compress, setCompress] = useState(false);
	const [compressFile, setCompressFile] = useState<File | null>(null);
	const [retail, setRetail] = useState<boolean | undefined>(undefined);
	const [isTouchMode, setIsTouchMode] = useState(false);
	const [keyboardStyle, setKeyboardStyle] = useState<CSSProperties | null>(null);
	const [currentSaveName, setCurrentSaveName] = useState<string | undefined>(undefined);

	const cursorPos = useRef({ x: 0, y: 0 });
	const game = useRef<GameFunction | null>(null);
	const elementRef = useRef<HTMLElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const keyboardRef = useRef<HTMLInputElement | null>(null);
	const saveNameRef = useRef<string | undefined>(undefined);
	const cleanupRef = useRef<(() => void) | null>(null);
	const showKeyboard = useRef<CSSProperties | null>(null);
	const maxKeyboard = useRef(0);
	const keyboardNum = useRef(0);
	const touchControls = useRef(false);
	const touchButtons = useRef<(HTMLDivElement | null)[]>(Array(TOUCH.BUTTON_TOTAL).fill(null));
	const touchCtx = useRef<(CanvasRenderingContext2D | null)[]>(Array(TOUCH.BELT_BUTTON_COUNT).fill(null));
	const touchMods = useRef<[boolean, boolean, boolean]>([false, false, false]);
	const touchBelt = useRef<[number, number, number]>([-1, -1, -1]);
	const beltTime = useRef<number | undefined>(undefined);
	const panPos = useRef<{ x: number; y: number } | null>(null);
	const activeTouch = useRef<ITouchOther | null>(null);
	const secondaryTouch = useRef<{ clientX: number; clientY: number } | null>(null);

	const { fsRef, hasSpawn, saveNames, updateSaves } = useInitFSAndSaves();
	const { error, onError } = useErrorHandling(fsRef, saveNameRef);

	useEffect(() => {
		return () => cleanupRef.current?.();
	}, []);

	const pointerLocked = () => document.pointerLockElement === canvasRef.current;

	const getMousePos = useCallback((e: MouseEvent | { clientX: number; clientY: number } | null) => {
		if (!canvasRef.current) return { x: 0, y: 0 };
		const rect = canvasRef.current.getBoundingClientRect();

		if (e && "movementX" in e && pointerLocked()) {
			cursorPos.current.x = clamp(cursorPos.current.x + e.movementX, rect.left, rect.right);
			cursorPos.current.y = clamp(cursorPos.current.y + e.movementY, rect.top, rect.bottom);
		} else if (e) {
			cursorPos.current.x = e.clientX;
			cursorPos.current.y = e.clientY;
		}

		const x = Math.round(((cursorPos.current.x - rect.left) / rect.width) * DIABLO.WIDTH);
		const y = Math.round(((cursorPos.current.y - rect.top) / rect.height) * DIABLO.HEIGHT);

		return {
			x: clamp(x, 0, DIABLO.WIDTH - 1),
			y: clamp(y, 0, DIABLO.HEIGHT - 1),
		};
	}, []);

	const getMods = (e: MouseEvent | KeyboardEvent | TouchEvent) =>
		((e as KeyboardEvent).shiftKey || touchMods.current[TOUCH.SHIFT] ? MODS.SHIFT : 0) +
		((e as KeyboardEvent).ctrlKey ? MODS.CTRL : 0) +
		((e as KeyboardEvent).altKey ? MODS.ALT : 0) +
		((e as TouchEvent).touches ? MODS.TOUCH : 0);

	const clearSelection = () => {
		if (showKeyboard.current && keyboardRef.current) {
			const len = keyboardRef.current.value.length;
			keyboardRef.current.setSelectionRange(len, len);
		}
	};

	const onKeyboardInput = useCallback((blur: boolean) => {
		if (!showKeyboard.current || !keyboardRef.current) return;
		const text = keyboardRef.current.value;
		let valid = "";
		if (maxKeyboard.current > 0) {
			valid = (text.match(/[\x20-\x7E]/g) || []).join("").substring(0, maxKeyboard.current);
		} else {
			const maxValue = -maxKeyboard.current;
			if (/^\d*$/.test(text)) {
				keyboardNum.current = Math.min(text.length ? parseInt(text, 10) : 0, maxValue);
			}
			valid = keyboardNum.current ? keyboardNum.current.toString() : "";
		}

		if (text !== valid && keyboardRef.current) {
			keyboardRef.current.value = valid;
		}
		clearSelection();
		game.current?.("text", valid, blur ? 1 : 0);
	}, []);

	const setTouchMod = useCallback((idx: number, down: boolean, useItem = false) => {
		const isModButton = idx < TOUCH.MOD_COUNT;
		const isBeltButton = idx >= TOUCH.BUTTON_START_BELT && idx < TOUCH.BUTTON_START_BELT + TOUCH.BELT_BUTTON_COUNT;

		if (isModButton) {
			touchMods.current[idx as 0 | 1 | 2] = down;
			touchButtons.current[idx]?.classList.toggle("app__touch-button--active", down);
		} else if (useItem && isBeltButton) {
			const beltIndex = idx - TOUCH.BUTTON_START_BELT;
			const slot = touchBelt.current[beltIndex];
			if (slot >= 0) {
				const now = performance.now();
				if (beltTime.current === undefined || now - beltTime.current > 750) {
					game.current?.("DApi_Char", BELT.DIGIT_1_CHAR_CODE + slot);
					beltTime.current = now;
				}
			}
		}
	}, []);

	const drawBelt = useCallback((index: number, slot: number) => {
		const buttonIndex = TOUCH.BUTTON_START_BELT + index;
		const btn = touchButtons.current[buttonIndex];
		const ctx = touchCtx.current[index];
		if (!btn || !canvasRef.current) return;

		touchBelt.current[index] = slot;

		if (slot >= 0 && ctx) {
			btn.style.display = "block";
			ctx.clearRect(0, 0, BELT.ICON_SIZE, BELT.ICON_SIZE);
			ctx.drawImage(
				canvasRef.current,
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
	}, []);

	const processTouches = useCallback(
		(touches: TouchList, isRelease: boolean): boolean => {
			const touchArray = Array.from(touches);

			if (!touchControls.current) {
				touchControls.current = true;
				setIsTouchMode(true);
			}

			let newActive: ITouchOther | null = null;
			secondaryTouch.current = null;

			for (const t of touchArray) {
				const idx = touchButtons.current.indexOf(t.target as HTMLDivElement);
				if (activeTouch.current?.id === t.identifier) {
					activeTouch.current.clientX = t.clientX;
					activeTouch.current.clientY = t.clientY;
					if (touches.length > 1) activeTouch.current.stick = false;

					const other = touchArray.find((x) => x.identifier !== t.identifier);
					if (other) secondaryTouch.current = { clientX: other.clientX, clientY: other.clientY };
					panPos.current = null;
					return secondaryTouch.current !== null;
				}
				if (idx >= 0 && !newActive) {
					newActive = {
						id: t.identifier,
						index: idx,
						stick: true,
						original: touchMods.current[idx as 0 | 1 | 2] ?? false,
						clientX: t.clientX,
						clientY: t.clientY,
					};
				}
			}

			const isFKeyButton = (idx: number) => idx >= TOUCH.BUTTON_START_FKEY_LEFT;

			if (isRelease && activeTouch.current && isFKeyButton(activeTouch.current.index)) {
				game.current?.("DApi_Key", 1, 0, KEYS.FKEY_BASE + activeTouch.current.index);
			}

			if (isRelease && activeTouch.current?.stick) {
				const btn = activeTouch.current;
				const rect = touchButtons.current[btn.index]?.getBoundingClientRect();
				const inside =
					rect &&
					btn.clientX >= rect.left &&
					btn.clientX < rect.right &&
					btn.clientY >= rect.top &&
					btn.clientY < rect.bottom;
				setTouchMod(btn.index, inside ? !btn.original : btn.original, true);
			} else if (activeTouch.current && !isRelease) {
				setTouchMod(activeTouch.current.index, false);
			}

			activeTouch.current = newActive;

			if (newActive) {
				const i = newActive.index;
				if (!isFKeyButton(i)) {
					setTouchMod(i, true);
					if (i === TOUCH.MOVE) setTouchMod(TOUCH.RMB, false);
					if (i === TOUCH.RMB) setTouchMod(TOUCH.MOVE, false);
					panPos.current = null;
				} else {
					game.current?.("DApi_Key", 0, 0, KEYS.FKEY_BASE + i);
				}
			} else if (touches.length === 2) {
				const [t0, t1] = touchArray;
				const x = (t0.clientX + t1.clientX) / 2;
				const y = (t0.clientY + t1.clientY) / 2;
				if (panPos.current) {
					const dx = x - panPos.current.x;
					const dy = y - panPos.current.y;
					const step = (canvasRef.current!.offsetHeight || 1) / PAN.STEP_DIVISOR;
					if (Math.hypot(dx, dy) > step) {
						const key =
							Math.abs(dx) > Math.abs(dy)
								? dx > 0
									? KEYS.ARROW_LEFT
									: KEYS.ARROW_RIGHT
								: dy > 0
									? KEYS.ARROW_UP
									: KEYS.ARROW_DOWN;
						game.current?.("DApi_Key", 0, 0, key);
						panPos.current = { x, y };
					}
				} else {
					game.current?.("DApi_Mouse", 0, 0, MODS.TOUCH_PAN, 320, 180);
					game.current?.("DApi_Mouse", 2, 1, MODS.TOUCH_PAN, 320, 180);
					panPos.current = { x, y };
				}
				return false;
			} else {
				panPos.current = null;
			}

			const other = touchArray.find((t) => t.identifier !== newActive?.id);
			if (other) secondaryTouch.current = { clientX: other.clientX, clientY: other.clientY };
			return secondaryTouch.current !== null;
		},
		[setTouchMod]
	);

	const addEventListeners = useCallback(() => {
		const move = (e: MouseEvent) => {
			const { x, y } = getMousePos(e);
			game.current?.("DApi_Mouse", 0, 0, getMods(e), x, y);
			e.preventDefault();
		};

		const down = (e: MouseEvent) => {
			if (!canvasRef.current || e.target === keyboardRef.current) return;
			if (touchControls.current) {
				touchControls.current = false;
				setIsTouchMode(false);
			}
			const { x, y } = getMousePos(e);
			if (!pointerLocked() && window.innerHeight === screen.height) {
				canvasRef.current.requestPointerLock();
			}
			const button = MOUSE.BUTTON_MAP[e.button] ?? MOUSE.BUTTON_MAP[0];
			game.current?.("DApi_Mouse", 1, button, getMods(e), x, y);
			e.preventDefault();
		};

		const up = (e: MouseEvent) => {
			const { x, y } = getMousePos(e);
			const button = MOUSE.BUTTON_MAP[e.button] ?? MOUSE.BUTTON_MAP[0];
			game.current?.("DApi_Mouse", 2, button, getMods(e), x, y);
			if (e.target !== keyboardRef.current) e.preventDefault();
		};

		const keydown = (e: KeyboardEvent) => {
			game.current?.("DApi_Key", 0, getMods(e), e.keyCode);
			if (!showKeyboard.current && e.key.length === 1) game.current?.("DApi_Char", e.key.charCodeAt(0));
			if ([8, 13].includes(e.keyCode)) game.current?.("DApi_Char", e.keyCode);
			clearSelection();
			if (!showKeyboard.current && [8, 9, ...Array.from({ length: 8 }, (_, i) => 112 + i)].includes(e.keyCode)) {
				e.preventDefault();
			}
		};

		const keyup = (e: KeyboardEvent) => {
			game.current?.("DApi_Key", 1, getMods(e), e.keyCode);
			clearSelection();
		};

		const touchstart = (e: TouchEvent) => {
			if (!canvasRef.current || e.target === keyboardRef.current) return;
			keyboardRef.current?.blur();
			e.preventDefault();
			if (processTouches(e.touches, false) && secondaryTouch.current) {
				const { x, y } = getMousePos(secondaryTouch.current);
				game.current?.("DApi_Mouse", 0, 0, getMods(e), x, y);
				if (!touchMods.current[TOUCH.MOVE]) {
					const btn = touchMods.current[TOUCH.RMB] ? MOUSE.BUTTON_MAP[2] : MOUSE.BUTTON_MAP[0];
					game.current?.("DApi_Mouse", 1, btn, getMods(e), x, y);
				}
			}
		};

		const touchmove = (e: TouchEvent) => {
			if (!canvasRef.current) return;
			e.preventDefault();
			if (processTouches(e.touches, false) && secondaryTouch.current) {
				const { x, y } = getMousePos(secondaryTouch.current);
				game.current?.("DApi_Mouse", 0, 0, getMods(e), x, y);
			}
		};

		const touchend = (e: TouchEvent) => {
			if (!canvasRef.current) return;
			e.preventDefault();
			const lastSecondary = secondaryTouch.current && { ...secondaryTouch.current };
			const hadSecondary = !!lastSecondary;
			processTouches(e.touches, true);
			if (hadSecondary && !secondaryTouch.current && lastSecondary) {
				const { x, y } = getMousePos(lastSecondary);
				const leftButton = MOUSE.BUTTON_MAP[0];
				const rightButton = MOUSE.BUTTON_MAP[2];

				game.current?.("DApi_Mouse", 2, leftButton, getMods(e), x, y);
				game.current?.("DApi_Mouse", 2, rightButton, getMods(e), x, y);
				if (touchMods.current[TOUCH.RMB] && (!activeTouch.current || activeTouch.current.index !== TOUCH.RMB)) {
					setTouchMod(TOUCH.RMB, false);
				}
			}
			if (!document.fullscreenElement) elementRef.current?.requestFullscreen();
		};

		const onContextMenu = (e: MouseEvent) => e.preventDefault();

		const onPointerLockChange = () => {
			if (!pointerLocked() && window.innerHeight === screen.height) {
				game.current?.("DApi_Key", 0, 0, KEYS.ESC);
				game.current?.("DApi_Key", 1, 0, KEYS.ESC);
			}
		};

		const onResize = () => {
			document.exitPointerLock();
		};

		const opts = { passive: false, capture: true } as const;

		document.addEventListener("mousemove", move, true);
		document.addEventListener("mousedown", down, true);
		document.addEventListener("mouseup", up, true);
		document.addEventListener("keydown", keydown, true);
		document.addEventListener("keyup", keyup, true);
		document.addEventListener("contextmenu", onContextMenu, true);
		document.addEventListener("touchstart", touchstart, opts);
		document.addEventListener("touchmove", touchmove, opts);
		document.addEventListener("touchend", touchend, opts);
		document.addEventListener("pointerlockchange", onPointerLockChange);
		window.addEventListener("resize", onResize);

		return () => {
			document.removeEventListener("mousemove", move, true);
			document.removeEventListener("mousedown", down, true);
			document.removeEventListener("mouseup", up, true);
			document.removeEventListener("keydown", keydown, true);
			document.removeEventListener("keyup", keyup, true);
			document.removeEventListener("contextmenu", onContextMenu, true);
			document.removeEventListener("touchstart", touchstart, opts);
			document.removeEventListener("touchmove", touchmove, opts);
			document.removeEventListener("touchend", touchend, opts);
			document.removeEventListener("pointerlockchange", onPointerLockChange);
			window.removeEventListener("resize", onResize);
		};
	}, [getMousePos, processTouches, setTouchMod]);

	const start = useCallback(
		async (file: File | null = null) => {
			cleanupRef.current?.();
			cleanupRef.current = null;

			if (file) {
				const name = file.name.toLowerCase();
				if (name.endsWith(".sv")) {
					await (await fsRef.current).upload(file);
					updateSaves();
					return;
				}
				if (!name.endsWith(".mpq")) {
					alert("Please select a valid .mpq file (or spawn.mpq for free version).");
					return;
				}
			}

			if (showSaves) return;

			const isRetail = !!(file && !/^spawn\.mpq$/i.test(file.name));
			setRetail(isRetail);
			setLoading(true);

			try {
				const loaded = await load_game(
					{
						updateBelt: (belt) => {
							if (!belt) {
								TOUCH.BELT_SLOTS.forEach((slotIndex) => drawBelt(slotIndex, -1));
								return;
							}
							const used = new Set<number>();
							let pos = 0;
							for (let i = 0; i < belt.length && pos < TOUCH.BELT_SLOTS.length; i++) {
								if (belt[i] >= 0 && !used.has(belt[i])) {
									drawBelt(pos++, i);
									used.add(belt[i]);
								}
							}
							while (pos < TOUCH.BELT_SLOTS.length) drawBelt(pos++, -1);
						},
						canvas: canvasRef.current!,
						fs: fsRef.current,
						setCursorPos: (x, y) => {
							const rect = canvasRef.current!.getBoundingClientRect();
							cursorPos.current = {
								x: rect.left + (rect.width * x) / DIABLO.WIDTH,
								y: rect.top + (rect.height * y) / DIABLO.HEIGHT,
							};
							setTimeout(() => game.current?.("DApi_Mouse", 0, 0, 0, x, y), 0);
						},
						openKeyboard: (rect) => {
							if (rect && keyboardRef.current && elementRef.current) {
								const style: CSSProperties = {
									left: `${((100 * (rect[0] - 10)) / DIABLO.WIDTH).toFixed(2)}%`,
									top: `${((100 * (rect[1] - 10)) / DIABLO.HEIGHT).toFixed(2)}%`,
									width: `${((100 * (rect[2] - rect[0] + 20)) / DIABLO.WIDTH).toFixed(2)}%`,
									height: `${((100 * (rect[3] - rect[1] + 20)) / DIABLO.HEIGHT).toFixed(2)}%`,
								};
								showKeyboard.current = style;
								setKeyboardStyle(style);
								maxKeyboard.current = rect[4];
								Object.assign(keyboardRef.current.style, style);
								keyboardRef.current.focus();
							} else {
								showKeyboard.current = null;
								setKeyboardStyle(null);
								keyboardRef.current?.blur();
								if (keyboardRef.current) keyboardRef.current.value = "";
								keyboardNum.current = 0;
							}
						},
						onError,
						onProgress: setProgress,
						onExit: () => {
							cleanupRef.current?.();
						},
						setCurrentSave: (name) => {
							saveNameRef.current = name;
							setCurrentSaveName(name);
						},
					},
					file,
					!isRetail
				);

				game.current = loaded as GameFunction;
				const remove = addEventListeners();
				setLoading(false);
				setStarted(true);

				const worker = (loaded as { worker?: Worker }).worker;
				const webrtc = (loaded as { webrtc?: { send?: (data: Uint8Array) => void } }).webrtc;
				const intervalId = (loaded as { webrtcIntervalId?: number | null }).webrtcIntervalId ?? null;

				cleanupRef.current = () => {
					remove?.();
					game.current = null;
					worker?.terminate();
					if (intervalId != null) clearInterval(intervalId);
					try {
						webrtc?.send?.(new Uint8Array([0x24]));
					} catch {
						// ignore send errors
					}
					touchControls.current = false;
					setIsTouchMode(false);
					touchMods.current = [false, false, false];
					touchBelt.current = [-1, -1, -1];
					activeTouch.current = secondaryTouch.current = panPos.current = null;
					beltTime.current = undefined;
					touchButtons.current.forEach((b) => {
						if (b) {
							b.classList.remove("app__touch-button--active");
							if (b.parentElement?.classList.contains("app__touch-ui--belt")) b.style.display = "none";
						}
					});
					setStarted(false);
					setLoading(false);
					setRetail(undefined);
					showKeyboard.current = null;
					setKeyboardStyle(null);
				};
			} catch (e: unknown) {
				const err = e instanceof Error ? e : new Error(String(e));
				onError(err.message ?? "Failed to load game", err.stack ?? "");
				setLoading(false);
			}
		},
		[showSaves, fsRef, updateSaves, drawBelt, onError, addEventListeners]
	);

	const onDrop = useCallback(
		(file: File) => {
			if (compress) {
				setCompressFile(file);
			} else {
				start(file);
			}
		},
		[compress, start]
	);

	const { dropping } = useFileDrop(onDrop);

	return (
		<main
			className={cn("app", {
				"app--touch": isTouchMode,
				"app--started": started,
				"app--dropping": dropping > 0,
				"app--keyboard": !!keyboardStyle,
			})}
			ref={elementRef}
			role="application"
			aria-label="Diablo Web"
		>
			{started && (
				<>
					<section className="app__touch-ui app__touch-ui--mods" aria-hidden="true">
						{TOUCH.MOD_INDICES.map((i) => (
							<div
								key={i}
								className={cn("d1-btn d1-iconbtn app__touch-button", `app__touch-button--${i}`)}
								ref={(el) => {
									touchButtons.current[i] = el;
								}}
							/>
						))}
					</section>

					<section className="app__touch-ui app__touch-ui--belt" aria-hidden="true">
						{TOUCH.BELT_SLOTS.map((slotIdx) => {
							const buttonIndex = TOUCH.BUTTON_START_BELT + slotIdx;
							return (
								<div
									key={buttonIndex}
									className={cn(
										"d1-btn",
										"d1-iconbtn",
										"app__touch-button",
										`app__touch-button--${slotIdx}`
									)}
									ref={(el) => {
										touchButtons.current[buttonIndex] = el;
										if (el && !touchCtx.current[slotIdx]) {
											const c = document.createElement("canvas");
											c.width = c.height = BELT.ICON_SIZE;
											el.appendChild(c);
											touchCtx.current[slotIdx] = c.getContext("2d");
										}
									}}
								/>
							);
						})}
					</section>

					<section className="app__touch-ui app__touch-ui--fkeys-left" aria-hidden="true">
						{TOUCH.FKEY_LEFT_INDICES.map((idx) => (
							<div
								key={`fkeys-left-${idx}`}
								className={cn(
									"d1-btn",
									"d1-iconbtn",
									"app__touch-button",
									`app__touch-button--${idx - TOUCH.BUTTON_START_BELT}`
								)}
								ref={(el) => {
									touchButtons.current[idx] = el;
								}}
							/>
						))}
					</section>

					<section className="app__touch-ui app__touch-ui--fkeys-right" aria-hidden="true">
						{TOUCH.FKEY_RIGHT_INDICES.map((idx) => (
							<div
								key={`fkeys-right-${idx}`}
								className={cn(
									"d1-btn",
									"d1-iconbtn",
									"app__touch-button",
									`app__touch-button--${idx - TOUCH.BUTTON_START_BELT}`
								)}
								ref={(el) => {
									touchButtons.current[idx] = el;
								}}
							/>
						))}
					</section>
				</>
			)}

			<section className="app__body" aria-label="Game viewport">
				<div className="app__inner">
					{!error && <canvas ref={canvasRef} width={DIABLO.WIDTH} height={DIABLO.HEIGHT} />}
					<input
						type="text"
						className="app__keyboard"
						id="virtual-keyboard-input"
						ref={keyboardRef}
						onChange={() => onKeyboardInput(false)}
						onBlur={() => onKeyboardInput(true)}
						spellCheck={false}
						style={keyboardStyle || {}}
					/>
				</div>
			</section>

			<section className="app__body-v" aria-live="polite">
				<Suspense fallback={null}>
					{showSaves && typeof saveNames === "object" && (
						<SaveList
							saveNames={saveNames as Record<string, IPlayerInfo | null>}
							onDownload={(name) => {
								fsRef.current.then((fsInstance) => fsInstance.download(name));
							}}
							onDelete={async (name) => {
								if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
								const fsInstance = await fsRef.current;
								await fsInstance.delete(name.toLowerCase());
								fsInstance.files.delete(name.toLowerCase());
								updateSaves();
							}}
							onUploadSave={start}
							onBack={() => setShowSaves(false)}
						/>
					)}

					{compress && (
						<CompressMpq
							file={compressFile}
							setCompressFile={setCompressFile}
							setCompress={setCompress}
							onError={onError}
						/>
					)}

					{error && (
						<ErrorComponent error={error} retail={retail} saveUrl={error.save} saveName={currentSaveName} />
					)}
				</Suspense>

				{loading && !started && !error && <LoadingComponent title="Loading..." progress={progress} />}

				{!started && !compress && !loading && !error && !showSaves && (
					<StartScreen
						hasSpawn={hasSpawn}
						start={start}
						saveNames={saveNames}
						onCompressMpq={() => setCompress(true)}
						onOpenSaves={() => setShowSaves((prev) => !prev)}
					/>
				)}
			</section>
		</main>
	);
};

export default App;
