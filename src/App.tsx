import React, { useState, useEffect, useRef, useCallback, ChangeEvent } from "react";
import classNames from "classnames";
import { mapStackTrace } from "sourcemapped-stacktrace";
import Peer from "peerjs";

import getPlayerName from "./api/savefile";
import load_game from "./api/loader";
import { SpawnSizes } from "./api/load_spawn";
import create_fs from "./fs";
import CompressMpq from "./mpqcmp";
import { reportLink, isDropFile, getDropFile, findKeyboardRule } from "./utils";
import { IError, IPlayerInfo, IProgress, ITouchOther } from "./types";

import "./App.scss";

window.Peer = Peer;

const TOUCH_MOVE = 0;
const TOUCH_RMB = 1;
const TOUCH_SHIFT = 2;

let keyboardRule: CSSStyleRule | null = null;
try {
	keyboardRule = findKeyboardRule();
} catch (e) {
	console.error(e);
}

const Link: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = ({ children, ...props }) => (
	<a target="_blank" rel="noopener noreferrer" {...props}>
		{children}
	</a>
);

const App: React.FC = () => {
	const [started, setStarted] = useState(false);
	const [loading, setLoading] = useState(false);
	const [dropping, setDropping] = useState(0);
	const [hasSpawn, setHasSpawn] = useState(false);
	const [error, setError] = useState<IError | undefined>(undefined);
	const [progress, setProgress] = useState<IProgress | undefined>(undefined);
	const [saveNames, setSaveNames] = useState<boolean | Record<string, IPlayerInfo | null>>(false);
	const [showSaves, setShowSaves] = useState(false);
	const [compress, setCompress] = useState(false);
	const [compressFile, setCompressFile] = useState<File | null>(null);
	const [retail, setRetail] = useState<boolean | undefined>(undefined);

	const cursorPos = useRef({ x: 0, y: 0 });
	const touchControls = useRef(false);
	const touchButtons = useRef<HTMLDivElement[]>(Array(10).fill(null));
	const touchCtx = useRef<(CanvasRenderingContext2D | null)[]>(Array(6).fill(null));
	const touchMods = useRef<boolean[]>(Array(6).fill(false));
	const touchBelt = useRef<number[]>(Array(6).fill(-1));
	const maxKeyboard = useRef(0);

	const fs = useRef(create_fs());
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const game = useRef<any>(null);
	const elementRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const keyboardRef = useRef<HTMLInputElement>(null);
	const saveNameRef = useRef<string | undefined>(undefined);

	const showKeyboard = useRef<boolean | {}>(false);
	const keyboardNum = useRef(0);
	const beltTime = useRef<number | undefined>(undefined);
	const panPos = useRef<{ x: number; y: number } | undefined>(undefined);
	const touchButton = useRef<ITouchOther | null>(null);
	const touchCanvas = useRef<{ clientX: number; clientY: number } | null>(null);

	useEffect(() => {
		document.addEventListener("drop", onDrop, true);
		document.addEventListener("dragover", onDragOver, true);
		document.addEventListener("dragenter", onDragEnter, true);
		document.addEventListener("dragleave", onDragLeave, true);

		fs.current.then((fs) => {
			const spawn = fs.files.get("spawn.mpq");
			if (spawn && SpawnSizes.includes(spawn.byteLength)) {
				setHasSpawn(true);
			}
			if ([...fs.files.keys()].filter((name) => name.match(/\.sv$/i)).length) {
				setSaveNames(true);
			}
		});

		return () => {
			document.removeEventListener("drop", onDrop, true);
			document.removeEventListener("dragover", onDragOver, true);
			document.removeEventListener("dragenter", onDragEnter, true);
			document.removeEventListener("dragleave", onDragLeave, true);
		};
	}, []);

	const onDragEnter = useCallback((e: DragEvent) => {
		e.preventDefault();
		setDropping((prev) => Math.max(prev + 1, 0));
	}, []);

	const onDragOver = useCallback((e: DragEvent) => {
		if (isDropFile(e)) {
			e.preventDefault();
		}
	}, []);

	const onDragLeave = useCallback(() => {
		setDropping((prev) => Math.max(prev - 1, 0));
	}, []);

	const onError = useCallback(async (message: string, stack?: string) => {
		const errorObject: IError = { message };

		if (saveNameRef.current) {
			const fsInstance = await fs.current;
			errorObject.save = await fsInstance.fileUrl(saveNameRef.current);
		}

		const updateErrorState = (stack?: string[]) => {
			setError((prevError) => {
				if (!prevError) {
					return {
						...errorObject,
						stack: stack?.join("\n"),
					};
				}
				return prevError;
			});
		};

		if (stack) {
			mapStackTrace(stack, (mappedStack) => updateErrorState(mappedStack));
		} else {
			updateErrorState();
		}
	}, []);

	const openKeyboard = useCallback((rect: number[] | null) => {
		if (rect && elementRef.current && keyboardRef.current) {
			showKeyboard.current = {
				left: `${((100 * (rect[0] - 10)) / 640).toFixed(2)}%`,
				top: `${((100 * (rect[1] - 10)) / 480).toFixed(2)}%`,
				width: `${((100 * (rect[2] - rect[0] + 20)) / 640).toFixed(2)}%`,
				height: `${((100 * (rect[3] - rect[1] + 20)) / 640).toFixed(2)}%`,
			};
			maxKeyboard.current = rect[4];
			elementRef.current.classList.add("keyboard");
			Object.assign(keyboardRef.current.style, showKeyboard.current);
			keyboardRef.current.focus();
			if (keyboardRule) {
				keyboardRule.style.transform = `translate(-50%, ${((-(rect[1] + rect[3]) * 56.25) / 960).toFixed(
					2
				)}vw)`;
			}
		} else {
			showKeyboard.current = false;
			elementRef.current!.classList.remove("keyboard");
			keyboardRef.current!.blur();
			keyboardRef.current!.value = "";
			keyboardNum.current = 0;
		}
	}, []);

	const setCursorPos = (x: number, y: number) => {
		const rect = canvasRef.current!.getBoundingClientRect();
		cursorPos.current = {
			x: rect.left + ((rect.right - rect.left) * x) / 640,
			y: rect.top + ((rect.bottom - rect.top) * y) / 480,
		};
		setTimeout(() => {
			game.current("DApi_Mouse", 0, 0, 0, x, y);
		});
	};

	const onProgress = (progress: IProgress) => {
		setProgress(progress);
	};

	const onExit = () => {
		if (!error) {
			window.location.reload();
		}
	};

	const setCurrentSave = (name: string) => {
		saveNameRef.current = name;
	};

	const updateShowSaves = () => {
		if (saveNames === true) {
			updateSaves().then(() => setShowSaves(!showSaves));
		} else {
			setShowSaves(!showSaves);
		}
	};

	const updateSaves = () => {
		return fs.current.then((fs) => {
			const saves: Record<string, IPlayerInfo | null> = {};
			[...fs.files.keys()]
				.filter((name) => name.match(/\.sv$/i))
				.forEach((name) => {
					saves[name] = getPlayerName(fs.files.get(name)!.buffer, name);
				});
			setSaveNames(saves);
		});
	};

	const removeSave = (name: string) => {
		if (window.confirm(`Are you sure you want to delete ${name}?`)) {
			(async () => {
				const fsInstance = await fs.current;
				await fsInstance.delete(name.toLowerCase());
				fsInstance.files.delete(name.toLowerCase());
				updateSaves();
			})();
		}
	};

	const downloadSave = (name: string) => {
		fs.current.then((fs) => fs.download(name));
	};

	const drawBelt = (idx: number, slot: number) => {
		if (!canvasRef.current) return;
		if (!touchButtons.current[idx]) {
			return;
		}
		touchBelt.current[idx] = slot;
		if (slot >= 0) {
			touchButtons.current[idx]!.style.display = "block";
			touchCtx.current[idx]?.drawImage(canvasRef.current, 205 + 29 * slot, 357, 28, 28, 0, 0, 28, 28);
		} else {
			touchButtons.current[idx]!.style.display = "none";
		}
	};

	const updateBelt = (belt: number[]) => {
		if (belt) {
			const used = new Set<number>();
			let pos = 3;
			for (let i = 0; i < belt.length && pos < 6; ++i) {
				if (belt[i] >= 0 && !used.has(belt[i])) {
					drawBelt(pos++, i);
					used.add(belt[i]);
				}
			}
			for (; pos < 6; ++pos) {
				drawBelt(pos, -1);
			}
		} else {
			drawBelt(3, -1);
			drawBelt(4, -1);
			drawBelt(5, -1);
		}
	};

	const start = useCallback(
		(file: File | null = null) => {
			if (file) {
				const fileName = file.name.toLowerCase();

				if (fileName.endsWith(".sv")) {
					fs.current.then((fsInstance) => fsInstance.upload(file)).then(() => updateSaves());
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

			document.removeEventListener("drop", onDrop, true);
			document.removeEventListener("dragover", onDragOver, true);
			document.removeEventListener("dragenter", onDragEnter, true);
			document.removeEventListener("dragleave", onDragLeave, true);
			setDropping(0);

			const isRetail = !!(file && !file.name.match(/^spawn\.mpq$/i));
			setLoading(true);
			setRetail(isRetail);

			load_game(
				{
					updateBelt,
					canvas: canvasRef.current!,
					fs: fs.current,
					setCursorPos,
					openKeyboard,
					onError,
					onProgress,
					onExit,
					setCurrentSave,
				},
				file,
				!isRetail
			).then(
				(loadedGame) => {
					game.current = loadedGame;

					addEventListeners();
					setStarted(true);
				},
				(e) => onError(e.message, e.stack)
			);
		},
		[onError, onProgress, showSaves]
	);

	const onDrop = useCallback(
		(e: DragEvent) => {
			e.preventDefault();
			const file = getDropFile(e);

			if (!file) return;

			if (compress) {
				setCompressFile(file);
			} else {
				start(file);
			}

			setDropping(0);
		},
		[compress, start]
	);

	const pointerLocked = () => {
		return document.pointerLockElement === canvasRef.current || document.pointerLockElement === canvasRef.current;
	};

	const mousePos = (e: { clientX: number; clientY: number } | null) => {
		const rect = canvasRef.current!.getBoundingClientRect();

		if (pointerLocked()) {
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

		return {
			x: Math.max(0, Math.min(x, 639)),
			y: Math.max(0, Math.min(y, 479)),
		};
	};

	const mouseButton = (e: MouseEvent) => {
		switch (e.button) {
			case 0:
				return 1;
			case 1:
				return 4;
			case 2:
				return 2;
			case 3:
				return 5;
			case 4:
				return 6;
			default:
				return 1;
		}
	};

	const eventMods = (e: MouseEvent | KeyboardEvent | TouchEvent) => {
		return (
			((e as KeyboardEvent).shiftKey || touchMods.current[TOUCH_SHIFT] ? 1 : 0) +
			((e as KeyboardEvent).ctrlKey ? 2 : 0) +
			((e as KeyboardEvent).altKey ? 4 : 0) +
			((e as TouchEvent).touches ? 8 : 0)
		);
	};

	const onResize = () => {
		document.exitPointerLock();
	};

	const onPointerLockChange = () => {
		if (window.screen && window.innerHeight === window.screen.height && !pointerLocked()) {
			game.current("DApi_Key", 0, 0, 27);
			game.current("DApi_Key", 1, 0, 27);
		}
	};

	const onMouseMove = (e: MouseEvent) => {
		if (!canvasRef.current) return;
		const { x, y } = mousePos(e);
		game.current("DApi_Mouse", 0, 0, eventMods(e), x, y);
		e.preventDefault();
	};

	const onMouseDown = (e: MouseEvent) => {
		if (!canvasRef.current) return;
		if (e.target === keyboardRef.current) {
			return;
		}
		if (touchControls.current) {
			touchControls.current = false;
			elementRef.current!.classList.remove("touch");
		}
		const { x, y } = mousePos(e);
		if (window.screen && window.innerHeight === window.screen.height) {
			// we're in fullscreen, let's get pointer lock!
			if (!pointerLocked()) {
				canvasRef.current.requestPointerLock();
			}
		}
		game.current("DApi_Mouse", 1, mouseButton(e), eventMods(e), x, y);
		e.preventDefault();
	};

	const onMouseUp = (e: MouseEvent) => {
		if (!canvasRef.current) return;
		const { x, y } = mousePos(e);
		game.current("DApi_Mouse", 2, mouseButton(e), eventMods(e), x, y);
		if (e.target !== keyboardRef.current) {
			e.preventDefault();
		}
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (!canvasRef.current) return;
		game.current("DApi_Key", 0, eventMods(e), e.keyCode);
		if (!showKeyboard.current && e.keyCode >= 32 && e.key.length === 1) {
			game.current("DApi_Char", e.key.charCodeAt(0));
		} else if (e.keyCode === 8 || e.keyCode === 13) {
			game.current("DApi_Char", e.keyCode);
		}
		clearKeySel();
		if (!showKeyboard.current) {
			if (e.keyCode === 8 || e.keyCode === 9 || (e.keyCode >= 112 && e.keyCode <= 119)) {
				e.preventDefault();
			}
		}
	};

	const onMenu = (e: MouseEvent) => {
		e.preventDefault();
	};

	const onKeyUp = (e: KeyboardEvent) => {
		if (!canvasRef.current) return;
		game.current("DApi_Key", 1, eventMods(e), e.keyCode);
		clearKeySel();
	};

	const clearKeySel = () => {
		if (showKeyboard.current) {
			const len = keyboardRef.current!.value.length;
			keyboardRef.current!.setSelectionRange(len, len);
		}
	};

	const onKeyboardInner = (flags: number) => {
		if (!showKeyboard.current) return;

		const text = keyboardRef.current!.value;
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
			keyboardRef.current!.value = valid;
		}

		clearKeySel();
		game.current("text", valid, flags);
	};

	const onKeyboard = () => {
		onKeyboardInner(0);
	};

	const onKeyboardBlur = () => {
		onKeyboardInner(1);
	};

	const parseFile = (e: ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (files && files.length > 0) {
			start(files[0]);
		}
	};

	const parseSave = (e: ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (files && files.length > 0) {
			start(files[0]);
		}
	};

	const setTouchMod = (index: number, value: boolean, use?: boolean) => {
		if (index < 3) {
			touchMods.current[index] = value;
			if (touchButtons.current[index]) {
				touchButtons.current[index].classList.toggle("active", value);
			}
		} else if (use && touchBelt.current[index] >= 0) {
			const now = performance.now();
			if (!beltTime.current || now - beltTime.current > 750) {
				game.current("DApi_Char", 49 + touchBelt.current[index]);
				beltTime.current = now;
			}
		}
	};

	const updateTouchButton = (touches: TouchList, release: boolean) => {
		let touchOther: ITouchOther | null = null;

		if (!touchControls.current) {
			touchControls.current = true;
			elementRef.current!.classList.add("touch");
		}

		const btn = touchButton.current;
		const findTouchCanvas = (touches: TouchList, identifier: number) =>
			[...touches].find((t) => t.identifier !== identifier) || null;

		for (const touch of touches) {
			const { target, identifier, clientX, clientY } = touch;
			const idx = touchButtons.current.indexOf(target as HTMLDivElement);

			if (btn && btn.id === identifier && touchButtons.current[btn.index] === target) {
				if (touches.length > 1) {
					btn.stick = false;
				}
				btn.clientX = clientX;
				btn.clientY = clientY;
				touchCanvas.current = findTouchCanvas(touches, identifier);

				if (touchCanvas.current) {
					touchCanvas.current = {
						clientX: touchCanvas.current.clientX,
						clientY: touchCanvas.current.clientY,
					};
				}

				delete panPos.current;
				return touchCanvas.current != null;
			}

			if (idx >= 0 && !touchOther) {
				touchOther = {
					id: identifier,
					index: idx,
					stick: true,
					original: touchMods.current[idx],
					clientX,
					clientY,
				};
			}
		}

		if (btn && !touchOther && release && btn.stick) {
			const rect = touchButtons.current[btn.index].getBoundingClientRect();
			const { clientX, clientY } = btn;
			if (clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom) {
				setTouchMod(btn.index, !btn.original, true);
			} else {
				setTouchMod(btn.index, btn.original);
			}
		} else if (btn) {
			setTouchMod(btn.index, false);
		}

		touchButton.current = touchOther;

		if (touchOther) {
			const { index } = touchOther;

			if (index < 6) {
				setTouchMod(index, true);
				if (index === TOUCH_MOVE) {
					setTouchMod(TOUCH_RMB, false);
				} else if (index === TOUCH_RMB) {
					setTouchMod(TOUCH_MOVE, false);
				}
				delete panPos.current;
			} else {
				// touching F key
				game.current("DApi_Key", 0, 0, 110 + index);
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
					game.current("DApi_Key", 0, 0, key);
					// key up is ignored anyway
					panPos.current = { x, y };
				}
			} else {
				game.current("DApi_Mouse", 0, 0, 24, 320, 180);
				game.current("DApi_Mouse", 2, 1, 24, 320, 180);
				panPos.current = { x, y };
			}
			touchCanvas.current = null;
			return false;
		} else {
			delete panPos.current;
		}

		touchCanvas.current = findTouchCanvas(touches, touchOther?.id || -1);

		if (touchCanvas.current) {
			touchCanvas.current = {
				clientX: touchCanvas.current.clientX,
				clientY: touchCanvas.current.clientY,
			};
		}

		return touchCanvas.current != null;
	};

	const onTouchStart = (e: TouchEvent) => {
		if (!canvasRef.current) return;
		if (e.target === keyboardRef.current) {
			return;
		} else {
			keyboardRef.current!.blur();
		}
		e.preventDefault();
		if (updateTouchButton(e.touches, false)) {
			const { x, y } = mousePos(touchCanvas.current);
			game.current("DApi_Mouse", 0, 0, eventMods(e), x, y);
			if (!touchMods.current[TOUCH_MOVE]) {
				game.current("DApi_Mouse", 1, touchMods.current[TOUCH_RMB] ? 2 : 1, eventMods(e), x, y);
			}
		}
	};

	const onTouchMove = (e: TouchEvent) => {
		if (!canvasRef.current) return;
		if (e.target === keyboardRef.current) {
			return;
		}
		e.preventDefault();
		if (updateTouchButton(e.touches, false)) {
			const { x, y } = mousePos(touchCanvas.current);
			game.current("DApi_Mouse", 0, 0, eventMods(e), x, y);
		}
	};

	const onTouchEnd = (e: TouchEvent) => {
		if (!canvasRef.current) return;

		if (e.target !== keyboardRef.current) {
			e.preventDefault();
		}

		const prevTouchCanvas = touchCanvas.current;
		updateTouchButton(e.touches, true);

		if (prevTouchCanvas && !touchCanvas.current) {
			const { x, y } = mousePos(prevTouchCanvas);
			game.current("DApi_Mouse", 2, 1, eventMods(e), x, y);
			game.current("DApi_Mouse", 2, 2, eventMods(e), x, y);

			if (touchMods.current[TOUCH_RMB] && (!touchButton.current || touchButton.current.index !== TOUCH_RMB)) {
				setTouchMod(TOUCH_RMB, false);
			}
		}

		if (!document.fullscreenElement) {
			elementRef.current!.requestFullscreen();
		}
	};

	const addEventListeners = useCallback(() => {
		document.addEventListener("mousemove", onMouseMove, true);
		document.addEventListener("mousedown", onMouseDown, true);
		document.addEventListener("mouseup", onMouseUp, true);
		document.addEventListener("keydown", onKeyDown, true);
		document.addEventListener("keyup", onKeyUp, true);
		document.addEventListener("contextmenu", onMenu, true);

		document.addEventListener("touchstart", onTouchStart, {
			passive: false,
			capture: true,
		});
		document.addEventListener("touchmove", onTouchMove, {
			passive: false,
			capture: true,
		});
		document.addEventListener("touchend", onTouchEnd, {
			passive: false,
			capture: true,
		});

		document.addEventListener("pointerlockchange", onPointerLockChange);
		window.addEventListener("resize", onResize);
	}, [
		onMouseMove,
		onMouseDown,
		onMouseUp,
		onKeyDown,
		onKeyUp,
		onMenu,
		onTouchStart,
		onTouchMove,
		onTouchEnd,
		onPointerLockChange,
		onResize,
	]);

	const renderUi = () => {
		if (showSaves && typeof saveNames === "object") {
			const plrClass = ["Warrior", "Rogue", "Sorcerer"];
			return (
				<div className="start">
					<ul className="saveList">
						{Object.entries(saveNames).map(([name, info]) => (
							<li key={name}>
								<div>
									<div>{name}</div>
									{info ? (
										<div className="info">
											{info.name} (lv. {info.level} {plrClass[info.cls]})
										</div>
									) : null}
								</div>
								<div className="btn">
									<div className="btnDownload" onClick={() => downloadSave(name)}>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="currentColor"
											width="16px"
											height="16px"
										>
											<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
										</svg>
									</div>
									<div className="btnRemove" onClick={() => removeSave(name)}>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="currentColor"
											width="16px"
											height="16px"
										>
											<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
										</svg>
									</div>
								</div>
							</li>
						))}
					</ul>
					<form>
						<label htmlFor="loadFile" className="startButton">
							Upload Save
						</label>
						<input
							accept=".sv"
							type="file"
							id="loadFile"
							style={{ display: "none" }}
							onChange={parseSave}
						/>
					</form>
					<div className="startButton" onClick={() => setShowSaves(false)}>
						Back
					</div>
				</div>
			);
		} else if (compress) {
			return (
				<CompressMpq
					file={compressFile}
					setCompressFile={setCompressFile}
					setCompress={setCompress}
					onError={onError}
				/>
			);
		} else if (error) {
			return (
				<Link className="error" href={reportLink(error, retail!)}>
					<p className="header">The following error has occurred:</p>
					<p className="body">{error.message}</p>
					<p className="footer">Click to create an issue on GitHub</p>
					{error.save != null && (
						<a href={error.save} download={saveNameRef.current}>
							Download save file
						</a>
					)}
				</Link>
			);
		} else if (loading && !started) {
			return (
				<div className="loading">
					{(progress && progress.text) || "Loading..."}
					{progress != null && !!progress.total && (
						<span className="progressBar">
							<span>
								<span
									style={{
										width: `${Math.round((100 * progress.loaded!) / progress.total)}%`,
									}}
								/>
							</span>
						</span>
					)}
				</div>
			);
		} else if (!started) {
			return (
				<div className="start">
					<p>
						This is a web port of the original Diablo game, based on source code reconstructed by GalaXyHaXz
						and devilution team. The project page with information and links can be found over here{" "}
						<Link href="https://github.com/JohnImril/diablo_web">
							https://github.com/JohnImril/diablo_web
						</Link>
					</p>
					<p>
						If you own the original game, you can drop the original DIABDAT.MPQ onto this page or click the
						button below to start playing. The game can be purchased from{" "}
						<Link href="https://www.gog.com/game/diablo">GoG</Link>.{" "}
						<span className="link" onClick={() => setCompress(true)}>
							Click here to compress the MPQ, greatly reducing its size.
						</span>
					</p>
					{!hasSpawn && <p>Or you can play the shareware version for free (50MB download).</p>}
					<form>
						<label htmlFor="loadFile" className="startButton">
							Select MPQ
						</label>
						<input
							accept=".mpq"
							type="file"
							id="loadFile"
							style={{ display: "none" }}
							onChange={parseFile}
						/>
					</form>
					<div className="startButton" onClick={() => start()}>
						Play Shareware
					</div>
					{!!saveNames && (
						<div className="startButton" onClick={updateShowSaves}>
							Manage Saves
						</div>
					)}
				</div>
			);
		}
		return null;
	};

	return (
		<div
			className={classNames("App", {
				touch: touchControls.current,
				started,
				dropping,
				keyboard: !!showKeyboard.current,
			})}
			ref={elementRef}
		>
			<div className="touch-ui touch-mods">
				<div
					className={classNames("touch-button", "touch-button-0", {
						active: touchMods.current[0],
					})}
					ref={(el) => (touchButtons.current[0] = el!)}
				/>
				<div
					className={classNames("touch-button", "touch-button-1", {
						active: touchMods.current[1],
					})}
					ref={(el) => (touchButtons.current[1] = el!)}
				/>
				<div
					className={classNames("touch-button", "touch-button-2", {
						active: touchMods.current[2],
					})}
					ref={(el) => (touchButtons.current[2] = el!)}
				/>
			</div>
			<div className="touch-ui touch-belt">
				<div
					className={classNames("touch-button", "touch-button-0")}
					ref={(el) => {
						touchButtons.current[3] = el!;

						if (el) {
							const canvas = document.createElement("canvas");
							canvas.width = 28;
							canvas.height = 28;
							el.appendChild(canvas);
							touchCtx.current[3] = canvas.getContext("2d");
						} else {
							touchCtx.current[3] = null;
						}
					}}
				/>
				<div
					className={classNames("touch-button", "touch-button-1")}
					ref={(el) => {
						touchButtons.current[4] = el!;
						if (el) {
							const canvas = document.createElement("canvas");
							canvas.width = 28;
							canvas.height = 28;
							el.appendChild(canvas);
							touchCtx.current[4] = canvas.getContext("2d");
						} else {
							touchCtx.current[4] = null;
						}
					}}
				/>
				<div
					className={classNames("touch-button", "touch-button-2")}
					ref={(el) => {
						touchButtons.current[5] = el!;
						if (el) {
							const canvas = document.createElement("canvas");
							canvas.width = 28;
							canvas.height = 28;
							el.appendChild(canvas);
							touchCtx.current[5] = canvas.getContext("2d");
						} else {
							touchCtx.current[5] = null;
						}
					}}
				/>
			</div>
			<div className="touch-ui fkeys-left">
				<div
					className={classNames("touch-button", "touch-button-3")}
					ref={(el) => (touchButtons.current[6] = el!)}
				/>
				<div
					className={classNames("touch-button", "touch-button-4")}
					ref={(el) => (touchButtons.current[7] = el!)}
				/>
			</div>
			<div className="touch-ui fkeys-right">
				<div
					className={classNames("touch-button", "touch-button-5")}
					ref={(el) => (touchButtons.current[8] = el!)}
				/>
				<div
					className={classNames("touch-button", "touch-button-6")}
					ref={(el) => (touchButtons.current[9] = el!)}
				/>
			</div>
			<div className="Body">
				<div className="inner">
					{!error && <canvas ref={canvasRef} width={640} height={480} />}
					<input
						type="text"
						className="keyboard"
						id="virtual-keyboard-input"
						onChange={onKeyboard}
						onBlur={onKeyboardBlur}
						ref={keyboardRef}
						spellCheck={false}
						style={showKeyboard.current || {}}
					/>
				</div>
			</div>
			<div className="BodyV">{renderUi()}</div>
		</div>
	);
};

export default App;
