import React, { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import cn from "classnames";

import load_game from "./api/loader";
import LoadingComponent from "./components/LoadingComponent/LoadingComponent";
import StartScreen from "./components/StartScreen/StartScreen";
import { useErrorHandling, useFileDrop, useInitFSAndSaves, useKeyboardRule } from "./hooks";
import type { GameFunction, IPlayerInfo, IProgress, ITouchOther } from "./types";

import "./base.css";
import "./App.css";

const SaveList = lazy(() => import("./components/SaveList/SaveList"));
const CompressMpq = lazy(() => import("./mpqcmp/CompressMpq"));
const ErrorComponent = lazy(() => import("./components/ErrorComponent/ErrorComponent"));

const TOUCH_MOVE = 0;
const TOUCH_RMB = 1;
const TOUCH_SHIFT = 2;

const App: React.FC = () => {
	const [started, setStarted] = useState(false);
	const [loading, setLoading] = useState(false);
	const [progress, setProgress] = useState<IProgress | undefined>(undefined);
	const [showSaves, setShowSaves] = useState(false);
	const [compress, setCompress] = useState(false);
	const [compressFile, setCompressFile] = useState<File | null>(null);
	const [retail, setRetail] = useState<boolean | undefined>(undefined);

	const cursorPos = useRef({ x: 0, y: 0 });
	const game = useRef<GameFunction | null>(null);
	const elementRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const keyboardRef = useRef<HTMLInputElement>(null);
	const saveNameRef = useRef<string | undefined>(undefined);
	const cleanupRef = useRef<(() => void) | null>(null);
	const showKeyboard = useRef<boolean | React.CSSProperties>(false);
	const keyboardNum = useRef(0);
	const maxKeyboard = useRef(0);
	const touchControls = useRef(false);
	const touchButtons = useRef<Array<HTMLDivElement | null>>(Array(10).fill(null));
	const touchCtx = useRef<Array<CanvasRenderingContext2D | null>>(Array(6).fill(null));
	const touchMods = useRef<boolean[]>(Array(6).fill(false));
	const touchBelt = useRef<number[]>(Array(6).fill(-1));
	const beltTime = useRef<number | undefined>(undefined);
	const panPos = useRef<{ x: number; y: number } | undefined>(undefined);
	const touchButton = useRef<ITouchOther | null>(null);
	const touchCanvas = useRef<{ clientX: number; clientY: number } | null>(null);

	const { fsRef, hasSpawn, saveNames, updateSaves } = useInitFSAndSaves();
	const keyboardRule = useKeyboardRule();
	const { error, onError } = useErrorHandling(fsRef, saveNameRef);

	useEffect(() => {
		return () => {
			touchButtons.current.forEach((btn) => {
				if (btn) {
					const canvas = btn.querySelector("canvas");
					canvas?.remove();
				}
			});
			touchCtx.current.fill(null);
		};
	}, []);

	const drawBelt = useCallback((idx: number, slot: number) => {
		if (!canvasRef.current || !touchButtons.current[idx]) return;
		touchBelt.current[idx] = slot;
		const ctx = touchCtx.current[idx];
		if (slot >= 0 && ctx) {
			touchButtons.current[idx]!.style.display = "block";
			ctx.drawImage(canvasRef.current, 205 + 29 * slot, 357, 28, 28, 0, 0, 28, 28);
		} else {
			touchButtons.current[idx]!.style.display = "none";
		}
	}, []);

	const pointerLocked = () => document.pointerLockElement === canvasRef.current;

	const mousePos = useCallback((e: { clientX: number; clientY: number } | null) => {
		const rect = canvasRef.current!.getBoundingClientRect();
		if (pointerLocked() && e) {
			cursorPos.current.x = Math.max(
				rect.left,
				Math.min(rect.right, cursorPos.current.x + (e as MouseEvent).movementX)
			);
			cursorPos.current.y = Math.max(
				rect.top,
				Math.min(rect.bottom, cursorPos.current.y + (e as MouseEvent).movementY)
			);
		} else if (e) {
			cursorPos.current.x = e.clientX;
			cursorPos.current.y = e.clientY;
		}

		const x = Math.round(((cursorPos.current.x - rect.left) / (rect.right - rect.left)) * 640);
		const y = Math.round(((cursorPos.current.y - rect.top) / (rect.bottom - rect.top)) * 480);
		return { x: Math.max(0, Math.min(x, 639)), y: Math.max(0, Math.min(y, 479)) };
	}, []);

	const mouseButton = (e: MouseEvent) => {
		const map: Record<number, number> = { 0: 1, 1: 4, 2: 2, 3: 5, 4: 6 };
		return map[e.button] || 1;
	};

	const eventMods = (e: MouseEvent | KeyboardEvent | TouchEvent) =>
		((e as KeyboardEvent).shiftKey || touchMods.current[TOUCH_SHIFT] ? 1 : 0) +
		((e as KeyboardEvent).ctrlKey ? 2 : 0) +
		((e as KeyboardEvent).altKey ? 4 : 0) +
		((e as TouchEvent).touches ? 8 : 0);

	const clearKeySel = () => {
		if (showKeyboard.current && keyboardRef.current) {
			const len = keyboardRef.current.value.length;
			keyboardRef.current.setSelectionRange(len, len);
		}
	};

	const onKeyboardInner = useCallback((flags: number) => {
		if (!showKeyboard.current || !keyboardRef.current) return;
		const text = keyboardRef.current.value;
		let valid = "";
		if (maxKeyboard.current > 0) {
			valid = (text.match(/[\x20-\x7E]/g) || []).join("").substring(0, maxKeyboard.current);
		} else {
			const maxValue = -maxKeyboard.current;
			if (text.match(/^\d*$/)) {
				keyboardNum.current = Math.min(text.length ? parseInt(text) : 0, maxValue);
			}
			valid = keyboardNum.current ? keyboardNum.current.toString() : "";
		}
		if (text !== valid) {
			keyboardRef.current.value = valid;
		}
		clearKeySel();
		game.current?.("text", valid, flags);
	}, []);

	const setTouchMod = useCallback((index: number, value: boolean, use?: boolean) => {
		if (index < 3) {
			touchMods.current[index] = value;
			touchButtons.current[index]?.classList.toggle("app__touch-button--active", value);
		} else if (use && touchBelt.current[index] >= 0) {
			const now = performance.now();
			if (!beltTime.current || now - beltTime.current > 750) {
				game.current?.("DApi_Char", 49 + touchBelt.current[index]);
				beltTime.current = now;
			}
		}
	}, []);

	const updateTouchButton = useCallback(
		(touches: TouchList, release: boolean) => {
			let newTouchButton: ITouchOther | null = null;
			if (!touchControls.current) {
				touchControls.current = true;
				elementRef.current?.classList.add("app--touch");
			}

			const btn = touchButton.current;
			const findTouchCanvas = (touches: TouchList, identifier: number) =>
				[...touches].find((t) => t.identifier !== identifier) || null;

			for (const touch of touches) {
				const { target, identifier, clientX, clientY } = touch;
				const idx = touchButtons.current.indexOf(target as HTMLDivElement);
				if (btn && btn.id === identifier && touchButtons.current[btn.index] === target) {
					if (touches.length > 1) btn.stick = false;
					btn.clientX = clientX;
					btn.clientY = clientY;
					touchCanvas.current = findTouchCanvas(touches, identifier);
					if (touchCanvas.current) {
						touchCanvas.current = {
							clientX: touchCanvas.current.clientX,
							clientY: touchCanvas.current.clientY,
						};
					}
					panPos.current = undefined;
					return touchCanvas.current != null;
				}
				if (idx >= 0 && !newTouchButton) {
					newTouchButton = {
						id: identifier,
						index: idx,
						stick: true,
						original: touchMods.current[idx],
						clientX,
						clientY,
					};
				}
			}

			if (btn && !newTouchButton && release && btn.stick) {
				const rect = touchButtons.current[btn.index]?.getBoundingClientRect();
				const { clientX, clientY } = btn;
				if (
					rect &&
					clientX >= rect.left &&
					clientX < rect.right &&
					clientY >= rect.top &&
					clientY < rect.bottom
				) {
					setTouchMod(btn.index, !btn.original, true);
				} else {
					setTouchMod(btn.index, btn.original);
				}
			} else if (btn) {
				setTouchMod(btn.index, false);
			}

			touchButton.current = newTouchButton;
			if (newTouchButton) {
				const { index } = newTouchButton;
				if (index < 6) {
					setTouchMod(index, true);
					if (index === TOUCH_MOVE) setTouchMod(TOUCH_RMB, false);
					else if (index === TOUCH_RMB) setTouchMod(TOUCH_MOVE, false);
					delete panPos.current;
				} else {
					game.current?.("DApi_Key", 0, 0, 110 + index);
				}
			} else if (touches.length === 2) {
				const x = (touches[1].clientX + touches[0].clientX) / 2;
				const y = (touches[1].clientY + touches[0].clientY) / 2;
				if (panPos.current) {
					const dx = x - panPos.current.x;
					const dy = y - panPos.current.y;
					const step = canvasRef.current!.offsetHeight / 12;
					if (Math.max(Math.abs(dx), Math.abs(dy)) > step) {
						const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0x25 : 0x27) : dy > 0 ? 0x26 : 0x28;
						game.current?.("DApi_Key", 0, 0, key);
						panPos.current = { x, y };
					}
				} else {
					game.current?.("DApi_Mouse", 0, 0, 24, 320, 180);
					game.current?.("DApi_Mouse", 2, 1, 24, 320, 180);
					panPos.current = { x, y };
				}
				touchCanvas.current = null;
				return false;
			} else {
				delete panPos.current;
			}

			touchCanvas.current = findTouchCanvas(touches, newTouchButton?.id || -1);
			if (touchCanvas.current) {
				touchCanvas.current = { clientX: touchCanvas.current.clientX, clientY: touchCanvas.current.clientY };
			}
			return touchCanvas.current != null;
		},
		[setTouchMod]
	);

	const addEventListeners = useCallback(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!canvasRef.current) return;
			const { x, y } = mousePos(e);
			game.current?.("DApi_Mouse", 0, 0, eventMods(e), x, y);
			e.preventDefault();
		};

		const handleMouseDown = (e: MouseEvent) => {
			if (!canvasRef.current || e.target === keyboardRef.current) return;
			if (touchControls.current) {
				touchControls.current = false;
				elementRef.current?.classList.remove("app--touch");
			}
			const { x, y } = mousePos(e);
			if (window.screen && window.innerHeight === window.screen.height && !pointerLocked()) {
				canvasRef.current.requestPointerLock();
			}
			game.current?.("DApi_Mouse", 1, mouseButton(e), eventMods(e), x, y);
			e.preventDefault();
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (!canvasRef.current) return;
			const { x, y } = mousePos(e);
			game.current?.("DApi_Mouse", 2, mouseButton(e), eventMods(e), x, y);
			if (e.target !== keyboardRef.current) e.preventDefault();
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (!canvasRef.current) return;
			game.current?.("DApi_Key", 0, eventMods(e), e.keyCode);
			if (!showKeyboard.current && e.key.length === 1) {
				game.current?.("DApi_Char", e.key.charCodeAt(0));
			} else if (e.keyCode === 8 || e.keyCode === 13) {
				game.current?.("DApi_Char", e.keyCode);
			}
			clearKeySel();
			if (
				!showKeyboard.current &&
				[
					8,
					9,
					...Array(8)
						.fill(0)
						.map((_, i) => 112 + i),
				].includes(e.keyCode)
			) {
				e.preventDefault();
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (!canvasRef.current) return;
			game.current?.("DApi_Key", 1, eventMods(e), e.keyCode);
			clearKeySel();
		};

		const handleContextMenu = (e: MouseEvent) => e.preventDefault();

		const handleTouchStart = (e: TouchEvent) => {
			if (!canvasRef.current || e.target === keyboardRef.current) return;
			keyboardRef.current?.blur();
			e.preventDefault();
			if (updateTouchButton(e.touches, false)) {
				const { x, y } = mousePos(touchCanvas.current);
				game.current?.("DApi_Mouse", 0, 0, eventMods(e), x, y);
				if (!touchMods.current[TOUCH_MOVE]) {
					game.current?.("DApi_Mouse", 1, touchMods.current[TOUCH_RMB] ? 2 : 1, eventMods(e), x, y);
				}
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (!canvasRef.current || e.target === keyboardRef.current) return;
			e.preventDefault();
			if (updateTouchButton(e.touches, false)) {
				const { x, y } = mousePos(touchCanvas.current);
				game.current?.("DApi_Mouse", 0, 0, eventMods(e), x, y);
			}
		};

		const handleTouchEnd = (e: TouchEvent) => {
			if (!canvasRef.current || e.target === keyboardRef.current) return;
			e.preventDefault();
			const prev = touchCanvas.current;
			updateTouchButton(e.touches, true);
			if (prev && !touchCanvas.current) {
				const { x, y } = mousePos(prev);
				game.current?.("DApi_Mouse", 2, 1, eventMods(e), x, y);
				game.current?.("DApi_Mouse", 2, 2, eventMods(e), x, y);
				if (touchMods.current[TOUCH_RMB] && (!touchButton.current || touchButton.current.index !== TOUCH_RMB)) {
					setTouchMod(TOUCH_RMB, false);
				}
			}
			if (!document.fullscreenElement) {
				elementRef.current?.requestFullscreen();
			}
		};

		const handlePointerLockChange = () => {
			if (window.screen && window.innerHeight === window.screen.height && !pointerLocked()) {
				game.current?.("DApi_Key", 0, 0, 27);
				game.current?.("DApi_Key", 1, 0, 27);
			}
		};

		const handleResize = () => document.exitPointerLock();

		const touchOptions = { passive: false, capture: true };

		document.addEventListener("mousemove", handleMouseMove, true);
		document.addEventListener("mousedown", handleMouseDown, true);
		document.addEventListener("mouseup", handleMouseUp, true);
		document.addEventListener("keydown", handleKeyDown, true);
		document.addEventListener("keyup", handleKeyUp, true);
		document.addEventListener("contextmenu", handleContextMenu, true);
		document.addEventListener("touchstart", handleTouchStart, touchOptions);
		document.addEventListener("touchmove", handleTouchMove, touchOptions);
		document.addEventListener("touchend", handleTouchEnd, touchOptions);
		document.addEventListener("pointerlockchange", handlePointerLockChange);
		window.addEventListener("resize", handleResize);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove, true);
			document.removeEventListener("mousedown", handleMouseDown, true);
			document.removeEventListener("mouseup", handleMouseUp, true);
			document.removeEventListener("keydown", handleKeyDown, true);
			document.removeEventListener("keyup", handleKeyUp, true);
			document.removeEventListener("contextmenu", handleContextMenu, true);
			document.removeEventListener("touchstart", handleTouchStart, touchOptions);
			document.removeEventListener("touchmove", handleTouchMove, touchOptions);
			document.removeEventListener("touchend", handleTouchEnd, touchOptions);
			document.removeEventListener("pointerlockchange", handlePointerLockChange);
			window.removeEventListener("resize", handleResize);
		};
	}, [mousePos, updateTouchButton, setTouchMod]);

	const start = useCallback(
		async (file: File | null = null) => {
			cleanupRef.current?.();
			cleanupRef.current = null;

			if (file) {
				const fileName = file.name.toLowerCase();
				if (fileName.endsWith(".sv")) {
					const fsInstance = await fsRef.current;
					await fsInstance.upload(file);
					updateSaves();
					return;
				}
				if (!fileName.endsWith(".mpq")) {
					window.alert(
						"Please select an MPQ file. If you downloaded the installer from GoG, you will need to install it on PC and use the MPQ file from the installation folder."
					);
					return;
				}
			}

			if (showSaves) return;

			const isRetail = !!(file && !/^spawn\.mpq$/i.test(file.name));
			setRetail(isRetail);
			setLoading(true);

			try {
				const loadedGame = await load_game(
					{
						updateBelt: (belt) => {
							if (belt) {
								const used = new Set<number>();
								let pos = 3;
								for (let i = 0; i < belt.length && pos < 6; ++i) {
									if (belt[i] >= 0 && !used.has(belt[i])) {
										drawBelt(pos++, i);
										used.add(belt[i]);
									}
								}
								for (; pos < 6; ++pos) drawBelt(pos, -1);
							} else {
								for (let i = 3; i < 6; ++i) drawBelt(i, -1);
							}
						},
						canvas: canvasRef.current!,
						fs: fsRef.current,
						setCursorPos: (x: number, y: number) => {
							const rect = canvasRef.current!.getBoundingClientRect();
							cursorPos.current = {
								x: rect.left + ((rect.right - rect.left) * x) / 640,
								y: rect.top + ((rect.bottom - rect.top) * y) / 480,
							};
							setTimeout(() => game.current?.("DApi_Mouse", 0, 0, 0, x, y), 0);
						},
						openKeyboard: (rect) => {
							if (rect && elementRef.current && keyboardRef.current) {
								showKeyboard.current = {
									left: `${((100 * (rect[0] - 10)) / 640).toFixed(2)}%`,
									top: `${((100 * (rect[1] - 10)) / 480).toFixed(2)}%`,
									width: `${((100 * (rect[2] - rect[0] + 20)) / 640).toFixed(2)}%`,
									height: `${((100 * (rect[3] - rect[1] + 20)) / 640).toFixed(2)}%`,
								};
								maxKeyboard.current = rect[4];
								elementRef.current.classList.add("app--keyboard");
								Object.assign(keyboardRef.current.style, showKeyboard.current);
								keyboardRef.current.focus();
								if (keyboardRule) {
									keyboardRule.style.transform = `translate(-50%, ${(-(rect[1] + rect[3]) * 56.25) / 960}vw)`;
								}
							} else {
								showKeyboard.current = false;
								elementRef.current!.classList.remove("app--keyboard");
								keyboardRef.current!.blur();
								keyboardRef.current!.value = "";
								keyboardNum.current = 0;
							}
						},
						onError,
						onProgress: setProgress,
						onExit: () => {
							cleanupRef.current?.();
							cleanupRef.current = null;
							if (!error) setStarted(false);
						},
						setCurrentSave: (name: string) => {
							saveNameRef.current = name;
						},
					},
					file,
					!isRetail
				);

				game.current = loadedGame as GameFunction;
				const removeListeners = addEventListeners();
				setLoading(false);
				setStarted(true);

				const worker = (loadedGame as any).worker as Worker | undefined;
				const webrtc = (loadedGame as any).webrtc as { send?: (data: Uint8Array) => void } | undefined;
				const webrtcIntervalId = (loadedGame as any).webrtcIntervalId as number | null;

				cleanupRef.current = () => {
					console.debug("[Cleanup] Running game cleanup...");

					removeListeners?.();
					game.current = null;

					worker?.terminate();

					if (webrtcIntervalId != null) {
						clearInterval(webrtcIntervalId);
					}

					try {
						webrtc?.send?.(new Uint8Array([0x24]));
					} catch (e) {
						console.warn("Failed to send leave_game:", e);
					}

					setStarted(false);
					setLoading(false);
					setRetail(undefined);
				};
			} catch (e: any) {
				onError(e.message, e.stack);
				setLoading(false);
			}
		},
		[showSaves, fsRef, updateSaves, drawBelt, onError, keyboardRule, error, addEventListeners, updateSaves]
	);

	const onDropFile = useCallback(
		(file: File) => {
			if (compress) {
				setCompressFile(file);
			} else {
				start(file);
			}
		},
		[compress, start]
	);

	const { dropping } = useFileDrop(onDropFile);

	useEffect(() => {
		return () => {
			cleanupRef.current?.();
			cleanupRef.current = null;
		};
	}, []);

	return (
		<div
			className={cn("app", {
				"app--touch": touchControls.current,
				"app--started": started,
				"app--dropping": dropping,
				"app--keyboard": !!showKeyboard.current,
			})}
			ref={elementRef}
		>
			<div className="app__touch-ui app__touch-ui--mods">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						key={`touch-mod-${i}`}
						className={cn("d1-btn", "d1-iconbtn", "app__touch-button", `app__touch-button--${i}`, {
							"app__touch-button--active": touchMods.current[i],
						})}
						ref={(el) => {
							touchButtons.current[i] = el;
						}}
					/>
				))}
			</div>

			<div className="app__touch-ui app__touch-ui--belt">
				{Array.from({ length: 3 }).map((_, i) => {
					const idx = i + 3;
					return (
						<div
							key={`touch-belt-${idx}`}
							className={cn("d1-btn", "d1-iconbtn", "app__touch-button", `app__touch-button--${i}`)}
							ref={(el) => {
								touchButtons.current[idx] = el;
								if (el && !touchCtx.current[idx]) {
									let canvas = el.querySelector("canvas") as HTMLCanvasElement | null;
									if (!canvas) {
										canvas = document.createElement("canvas");
										canvas.width = 28;
										canvas.height = 28;
										el.appendChild(canvas);
									}
									touchCtx.current[idx] = canvas.getContext("2d");
								} else if (!el) {
									touchCtx.current[idx] = null;
								}
							}}
						/>
					);
				})}
			</div>

			<div className="app__touch-ui app__touch-ui--fkeys-left">
				{Array.from({ length: 2 }).map((_, i) => {
					const idx = i + 6;
					return (
						<div
							key={`fkeys-left-${idx}`}
							className={cn("d1-btn", "d1-iconbtn", "app__touch-button", `app__touch-button--${idx - 3}`)}
							ref={(el) => {
								touchButtons.current[idx] = el;
							}}
						/>
					);
				})}
			</div>

			<div className="app__touch-ui app__touch-ui--fkeys-right">
				{Array.from({ length: 2 }).map((_, i) => {
					const idx = i + 8;
					return (
						<div
							key={`fkeys-right-${idx}`}
							className={cn("d1-btn", "d1-iconbtn", "app__touch-button", `app__touch-button--${idx - 3}`)}
							ref={(el) => {
								touchButtons.current[idx] = el;
							}}
						/>
					);
				})}
			</div>

			<div className="app__body">
				<div className="app__inner">
					{!error && <canvas ref={canvasRef} width={640} height={480} />}
					<input
						type="text"
						className="app__keyboard"
						id="virtual-keyboard-input"
						onChange={() => onKeyboardInner(0)}
						onBlur={() => onKeyboardInner(1)}
						ref={keyboardRef}
						spellCheck={false}
						style={(showKeyboard.current as React.CSSProperties) || {}}
					/>
				</div>
			</div>

			<div className="app__body-v">
				<Suspense fallback={null}>
					{showSaves && typeof saveNames === "object" && (
						<SaveList
							saveNames={saveNames as Record<string, IPlayerInfo | null>}
							fs={fsRef.current}
							updateSaves={updateSaves}
							setShowSaves={setShowSaves}
							start={start}
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
						<ErrorComponent
							error={error}
							retail={retail}
							saveUrl={error.save}
							saveName={saveNameRef.current}
						/>
					)}
				</Suspense>
				{loading && !started && !error && <LoadingComponent title="Loading..." progress={progress} />}
				{!started && !compress && !loading && !error && !showSaves && (
					<StartScreen
						hasSpawn={hasSpawn}
						start={start}
						saveNames={saveNames}
						setCompress={setCompress}
						setShowSaves={setShowSaves}
						updateSaves={updateSaves}
					/>
				)}
			</div>
		</div>
	);
};

export default App;
