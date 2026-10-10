import { useState, useRef, useCallback, useEffect, useReducer, useMemo, type CSSProperties } from "react";
import cn from "classnames";

import UpdateNotice from "./app/ui/UpdateNotice";
import { useAppUpdates } from "./app/uiHooks/useAppUpdates";
import SaveList from "./components/SaveList/SaveList";
import CompressMpq from "./app/ui/CompressMpq";
import ErrorComponent from "./components/ErrorComponent/ErrorComponent";
import LoadingComponent from "./components/LoadingComponent/LoadingComponent";
import StartScreen from "./components/StartScreen/StartScreen";
import TouchControls from "./components/TouchControls/TouchControls";
import VirtualKeyboard from "./components/VirtualKeyboard/VirtualKeyboard";
import { createGameRuntime, isRuntimeSessionCancelledError } from "./app/runtime";
import { transition } from "./app/runtime/lifecycleMachine";
import type { LifecycleState } from "./app/runtime/runtimeState";
import { useErrorHandling } from "./app/uiHooks/useErrorHandling";
import { useFileDrop } from "./app/uiHooks/useFileDrop";
import { useTouchControls } from "./app/uiHooks/useTouchControls";
import { DIABLO, TOUCH } from "./constants/controls";
import { MAX_MPQ_SIZE, MAX_SV_SIZE } from "./constants/files";
import { appUpdates } from "./app/updates/pwaUpdates";
import type { GameFunction, IPlayerInfo, IProgress } from "./types";

import "./base.css";
import "./App.css";

const App = () => {
	const [started, setStarted] = useState(false);
	const [loading, setLoading] = useState(false);
	const [importingSave, setImportingSave] = useState(false);
	const [progress, setProgress] = useState<IProgress | undefined>(undefined);
	const [showSaves, setShowSaves] = useState(false);
	const [compress, setCompress] = useState(false);
	const [compressFile, setCompressFile] = useState<File | null>(null);
	const [retail, setRetail] = useState<boolean | undefined>(undefined);
	const [isTouchMode, setIsTouchMode] = useState(false);
	const [keyboardStyle, setKeyboardStyle] = useState<CSSProperties | null>(null);
	const [currentSaveName, setCurrentSaveName] = useState<string | undefined>(undefined);
	const [hasSpawn, setHasSpawn] = useState<boolean | undefined>(undefined);
	const [saveNames, setSaveNames] = useState<false | Record<string, IPlayerInfo | null>>(false);
	const [, dispatchLifecycle] = useReducer(transition, "idle" as LifecycleState);

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

	const { error, onError: reportError } = useErrorHandling();
	const onError = useCallback(
		(...args: Parameters<typeof reportError>) => {
			setShowSaves(false);
			reportError(...args);
		},
		[reportError]
	);
	const {
		status: updateStatus,
		updating,
		available: updateAvailable,
	} = useAppUpdates(started || loading || importingSave || compress || showSaves, !!error);
	const runtime = useMemo(() => createGameRuntime(), []);
	const handleError = useCallback(
		(message: string, stack?: string) => {
			const saveName = saveNameRef.current;
			if (!saveName) {
				onError(message, stack, undefined, retail);
				return;
			}
			void runtime.getSaveUrl(saveName).then(
				(saveUrl) => onError(message, stack, saveUrl, retail),
				() => onError(message, stack, undefined, retail)
			);
		},
		[onError, retail, runtime]
	);
	const updateSaves = useCallback(async () => {
		try {
			const saves = await runtime.getSaves();
			setSaveNames(saves && Object.keys(saves).length > 0 ? saves : false);
		} catch (error) {
			handleError(`Unable to load saves: ${String(error)}`);
		}
	}, [runtime, handleError]);

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

	const applyUpdate = useCallback(() => {
		appUpdates.applyNow(async () => {
			await runtime.prepareForUpdate();
			stopAndCleanup();
		});
	}, [runtime, stopAndCleanup]);

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
		void runtime.ensureStorageReady().then(
			({ hasSpawn }) => {
				if (!cancelled) setHasSpawn(hasSpawn);
			},
			(error) => {
				if (!cancelled) onError(`Unable to open save storage: ${String(error)}`);
			}
		);
		return () => {
			cancelled = true;
		};
	}, [runtime, onError]);

	const start = useCallback(
		async (file: File | null = null) => {
			if (
				["available", "applying", "saving"].includes(appUpdates.getSnapshot()) &&
				!started &&
				!compress &&
				!showSaves
			)
				return;
			if (file) {
				const name = file.name.toLowerCase();

				if (!name.endsWith(".mpq") && !name.endsWith(".sv")) {
					alert("Please select a valid .mpq file (or spawn.mpq file)");
					return;
				}
				const maxSize = name.endsWith(".sv") ? MAX_SV_SIZE : MAX_MPQ_SIZE;
				if (file.size > maxSize) {
					const maxLabel = name.endsWith(".sv") ? "10 MB" : "1 GB";
					alert(`File is too large. Maximum allowed size is ${maxLabel}.`);
					return;
				}
			}

			if (showSaves && !file?.name.toLowerCase().endsWith(".sv")) return;
			if (!(await appUpdates.enterBusy())) return;

			stopAndCleanup();
			game.current = null;
			dispatchLifecycle("RESET");

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
					appUpdates.setBusy(true);
					setRetail(isRetail);
					setLoading(true);
					dispatchLifecycle("START");
				},
			});

			if (startResult.status === "importedSave") {
				setImportingSave(true);
				try {
					await startResult.promise;
				} catch (error) {
					handleError(`Unable to import save: ${String(error)}`);
				} finally {
					setImportingSave(false);
				}
				return;
			}

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
					if (isRuntimeSessionCancelledError(err)) return;
					handleError(err.message, err.stack);
					setLoading(false);
					dispatchLifecycle("FAIL");
				}
			);
		},
		[started, compress, showSaves, handleError, runtime, runUiCleanup, stopAndCleanup]
	);

	const onDrop = useCallback(
		(file: File) => {
			if (updating || error) return;
			if (compress) {
				setCompressFile(file);
			} else {
				start(file);
			}
		},
		[compress, start, updating, error]
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
			<UpdateNotice
				status={updateStatus}
				started={started}
				canRetry={!started && !loading && !importingSave && !compress && !showSaves}
				onApply={applyUpdate}
				loadBackups={runtime.getSaveBackups}
			/>
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

			<section className="app__body-v" aria-live="polite" inert={updating}>
				{showSaves && (
					<SaveList
						saveNames={saveNames || {}}
						onDownload={(name) => {
							runtime.downloadSave(name);
						}}
						onDelete={async (name) => {
							if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
							await runtime.deleteSave(name);
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

				{error && (
					<ErrorComponent
						error={error}
						saveName={currentSaveName}
						loadBackups={runtime.getSaveBackups}
						onApplyUpdate={updateAvailable ? applyUpdate : undefined}
						onReload={
							!started && !compress && !showSaves && !importingSave
								? async () => {
										await runtime.prepareForReload();
										window.location.reload();
									}
								: undefined
						}
					/>
				)}

				{loading && !started && !error && <LoadingComponent title="Loading..." progress={progress} />}

				{!started && !compress && !loading && !error && !showSaves && (
					<StartScreen
						hasSpawn={hasSpawn}
						disabled={updating}
						start={start}
						saveNames={saveNames}
						onCompressMpq={async () => {
							if (updating) return;
							if (!(await appUpdates.enterBusy())) return;
							setCompress(true);
						}}
						onOpenSaves={async () => {
							if (updating) return;
							if (!(await appUpdates.enterBusy())) return;
							setShowSaves(true);
						}}
					/>
				)}
			</section>
		</main>
	);
};

export default App;
