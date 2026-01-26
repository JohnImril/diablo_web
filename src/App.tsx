import { useState, useRef, useCallback, useEffect, useReducer, useMemo, type CSSProperties } from "react";
import cn from "classnames";

import SaveList from "./components/SaveList/SaveList";
import CompressMpq from "./app/ui/CompressMpq";
import ErrorComponent from "./components/ErrorComponent/ErrorComponent";
import LoadingComponent from "./components/LoadingComponent/LoadingComponent";
import StartScreen from "./components/StartScreen/StartScreen";
import TouchControls from "./components/TouchControls/TouchControls";
import VirtualKeyboard from "./components/VirtualKeyboard/VirtualKeyboard";
import { createGameRuntime } from "./app/runtime";
import { transition } from "./app/runtime/lifecycleMachine";
import type { LifecycleState } from "./app/runtime/runtimeState";
import { useErrorHandling } from "./app/uiHooks/useErrorHandling";
import { useFileDrop } from "./app/uiHooks/useFileDrop";
import { useTouchControls } from "./app/uiHooks/useTouchControls";
import { DIABLO, TOUCH } from "./constants/controls";
import type { GameFunction, IPlayerInfo, IProgress } from "./types";

import "./base.css";
import "./App.css";

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
	const [hasSpawn, setHasSpawn] = useState(false);
	const [saveNames, setSaveNames] = useState<false | Record<string, IPlayerInfo | null>>(false);
	const [lifecycleState, dispatchLifecycle] = useReducer(transition, "idle" as LifecycleState);

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
	const touchButtons = useRef<(HTMLDivElement | null)[]>(Array(TOUCH.BUTTON_TOTAL).fill(null));
	const touchCtx = useRef<(CanvasRenderingContext2D | null)[]>(Array(TOUCH.BELT_BUTTON_COUNT).fill(null));
	const touchBelt = useRef<[number, number, number]>([-1, -1, -1]);

	const { error, onError } = useErrorHandling();
	const runtime = useMemo(() => createGameRuntime(), []);
	const handleError = useCallback(
		(message: string, stack?: string) => {
			const saveName = saveNameRef.current;
			if (!saveName) {
				onError(message, stack, undefined, retail);
				return;
			}
			runtime.getSaveUrl(saveName).then((saveUrl) => onError(message, stack, saveUrl, retail));
		},
		[onError, retail, runtime]
	);
	const updateSaves = useCallback(async () => {
		const saves = await runtime.getSaves();
		if (!saves || Object.keys(saves).length === 0) {
			setSaveNames(false);
			return;
		}
		setSaveNames(saves);
	}, [runtime]);

	const runUiCleanup = useCallback(() => {
		cleanupRef.current = null;
		setStarted(false);
		setLoading(false);
		setRetail(undefined);
		showKeyboard.current = null;
		setKeyboardStyle(null);
		dispatchLifecycle("EXIT");
	}, []);

	const stopAndCleanup = useCallback(() => {
		const cleanup = cleanupRef.current;
		cleanupRef.current = null;
		runtime.stop();
		cleanup?.();
	}, [runtime]);

	useEffect(() => {
		return () => stopAndCleanup();
	}, [stopAndCleanup]);

	useEffect(() => {
		const unsubscribe = runtime.subscribeUI({
			onProgress: setProgress,
			onError: (payload) => handleError(payload.message, payload.stack),
			onSaveChanged: (payload) => {
				saveNameRef.current = payload.name ?? undefined;
				setCurrentSaveName(payload.name ?? undefined);
			},
			onExit: () => cleanupRef.current?.(),
			onReady: () => {
				/* empty */
			},
			onSavesChanged: () => {
				updateSaves();
			},
		});
		return () => unsubscribe();
	}, [runtime, handleError, updateSaves]);

	useEffect(() => {
		return () => runtime.dispose();
	}, [runtime]);

	useEffect(() => {
		runtime.initInput({
			getTarget: () => document,
			refs: {
				canvas: canvasRef,
				keyboard: keyboardRef,
				element: elementRef,
				showKeyboard,
				maxKeyboard,
				keyboardNum,
				cursorPos,
				touchButtons,
				touchBelt,
			},
			setIsTouchMode,
		});
	}, [runtime, setIsTouchMode]);

	useEffect(() => {
		let cancelled = false;
		runtime.ensureStorageReady().then(({ hasSpawn }) => {
			if (cancelled) return;
			setHasSpawn(hasSpawn);
		});
		return () => {
			cancelled = true;
		};
	}, [runtime]);

	const start = useCallback(
		(file: File | null = null) => {
			stopAndCleanup();

			game.current = null;
			dispatchLifecycle("RESET");

			if (file) {
				const name = file.name.toLowerCase();

				if (!name.endsWith(".mpq") && !name.endsWith(".sv")) {
					alert("Please select a valid .mpq file (or spawn.mpq file)");
					return;
				}
			}

			if (showSaves) return;

			const startResult = runtime.startWithFile({
				file,
				apiFactory: (fs) =>
					runtime.createUiApi({
						fs,
						canvasRef,
						keyboardRef,
						cursorPosRef: cursorPos,
						showKeyboardRef: showKeyboard,
						maxKeyboardRef: maxKeyboard,
						keyboardNumRef: keyboardNum,
						touchButtonsRef: touchButtons,
						touchCtxRef: touchCtx,
						touchBeltRef: touchBelt,
						setKeyboardStyle,
						onError: handleError,
						onProgress: setProgress,
						onExit: () => cleanupRef.current?.(),
						setCurrentSave: (name) => {
							saveNameRef.current = name;
							setCurrentSaveName(name);
						},
					}),
				onBeforeStart: ({ isRetail }) => {
					setRetail(isRetail);
					setLoading(true);
					dispatchLifecycle("START");
				},
			});

			if (startResult.status !== "starting") return;

			startResult.promise.then(
				(loaded) => {
					game.current = loaded;

					setLoading(false);
					dispatchLifecycle("LOADED");
					setStarted(true);
					dispatchLifecycle("RUN");

					cleanupRef.current = () => {
						runUiCleanup();
						game.current = null;
					};
				},
				(err) => {
					handleError(err.message, err.stack);
					setLoading(false);
					dispatchLifecycle("FAIL");
				}
			);
		},
		[showSaves, handleError, runtime, runUiCleanup, stopAndCleanup]
	);

	useEffect(() => {
		const _debug = lifecycleState as string;
		void _debug;
	}, [lifecycleState]);

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

	const { dropping } = useFileDrop(runtime, onDrop);
	useTouchControls(started, touchButtons, touchCtx);

	return (
		<main
			className={cn("app", {
				"app--touch": isTouchMode,
				"app--started": started,
				"app--dropping": dropping > 0,
				"app--keyboard": !!keyboardStyle,
			})}
			ref={elementRef}
			aria-label="Diablo Web"
		>
			<TouchControls enabled={started} touchButtons={touchButtons} />

			<section className="app__body" aria-label="Game viewport">
				<div className="app__inner">
					{!error && <canvas ref={canvasRef} width={DIABLO.WIDTH} height={DIABLO.HEIGHT} />}
					<VirtualKeyboard
						keyboardRef={keyboardRef}
						keyboardStyle={keyboardStyle}
						onInput={(blur) => runtime.handleKeyboardInput(blur)}
					/>
				</div>
			</section>

			<section className="app__body-v" aria-live="polite">
				{showSaves && typeof saveNames === "object" && (
					<SaveList
						saveNames={saveNames as Record<string, IPlayerInfo | null>}
						onDownload={(name) => {
							runtime.downloadSave(name);
						}}
						onDelete={async (name) => {
							if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
							await runtime.deleteSave(name);
						}}
						onSelect={() => {
							/* empty */
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
						onError={handleError}
						runCompress={runtime.compressMpq}
						downloadBlob={runtime.downloadBlob}
						revokeBlobUrl={runtime.revokeBlobUrl}
					/>
				)}

				{error && <ErrorComponent error={error} saveName={currentSaveName} />}

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
