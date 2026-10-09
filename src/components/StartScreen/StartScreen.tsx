import { useRef } from "react";
import type { IPlayerInfo } from "../../types";
import "./StartScreen.css";

interface IProps {
	hasSpawn: boolean;
	disabled?: boolean;
	start: (file?: File | null) => void;
	saveNames: false | Record<string, IPlayerInfo | null>;
	onCompressMpq: () => void;
	onOpenSaves: () => void;
}

const StartScreen = ({ disabled = false, hasSpawn, start, saveNames, onCompressMpq, onOpenSaves }: IProps) => {
	const fileInput = useRef<HTMLInputElement>(null);
	const hasSaves = !!(saveNames && Object.keys(saveNames).length > 0);
	return (
		<section className="start-screen u-scrollbar-gold" aria-labelledby="start-title">
			<div className="start-screen__layout">
				<div className="start-screen__scenery" aria-hidden="true">
					<div className="start-screen__atmosphere" />
				</div>
				<div className="start-screen__menu">
					<header className="start-screen__header">
						<p className="start-screen__eyebrow">The gates of Tristram</p>
						<h1 id="start-title" className="start-screen__title">
							Diablo
						</h1>
						<p className="start-screen__description">Play the original Diablo in your browser.</p>
						<div className="start-screen__divider" aria-hidden="true">
							<span />
						</div>
					</header>
					<div className="start-screen__actions">
						<button
							disabled={disabled}
							type="button"
							className="start-screen__button start-screen__button--primary"
							onClick={() => start()}
							aria-describedby="demo-description"
						>
							<span aria-hidden="true" className="start-screen__sigil">
								✦
							</span>
							Play Free Demo
							<span aria-hidden="true" className="start-screen__sigil">
								✦
							</span>
						</button>
						<p id="demo-description" className="start-screen__hint">
							{hasSpawn ? "Shareware ready in this browser." : "Shareware · 25–50 MB first download."}
							<br />
							Limited content. No purchase or MPQ needed.
						</p>
						<button
							disabled={disabled}
							type="button"
							className="start-screen__button start-screen__button--secondary"
							onClick={() => fileInput.current?.click()}
							aria-describedby="mpq-description"
						>
							Load Your MPQ
						</button>
						<input
							ref={fileInput}
							disabled={disabled}
							accept=".mpq"
							type="file"
							hidden
							aria-label="Choose your Diablo MPQ file"
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = "";
								if (file) start(file);
							}}
						/>
						<p id="mpq-description" className="start-screen__hint">
							Own Diablo? Select or drop DIABDAT.MPQ for the full game.
						</p>
						{hasSaves && (
							<button
								disabled={disabled}
								type="button"
								className="start-screen__saves d1-link"
								data-save-manager-trigger
								onClick={onOpenSaves}
							>
								Manage Saves
							</button>
						)}
					</div>
					<footer className="start-screen__credits">
						<p className="start-screen__credit">
							Browser adaptation by{" "}
							<a href="https://github.com/JohnImril" target="_blank" rel="noopener noreferrer">
								Nikita Maksimov
							</a>
						</p>
						<nav className="start-screen__links" aria-label="Project and author">
							<a href="https://github.com/JohnImril/diablo_web" target="_blank" rel="noopener noreferrer">
								<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
									<path
										fill="currentColor"
										d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.63 0c2.15-1.46 3.09-1.15 3.09-1.15.62 1.55.23 2.69.12 2.98.72.79 1.15 1.79 1.15 3.02 0 4.32-2.63 5.28-5.14 5.56.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z"
									/>
								</svg>
								GitHub Repository
							</a>
							<span className="start-screen__link-divider" aria-hidden="true">
								·
							</span>
							<a href="https://nikitamaksimov.dev" target="_blank" rel="noopener noreferrer">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									aria-hidden="true"
									focusable="false"
								>
									<path d="M14 4h6v6M20 4l-9 9M10 4H4v16h16v-6" />
								</svg>
								Portfolio
							</a>
						</nav>
					</footer>
					<details className="start-screen__details">
						<summary>
							<span>Controls, limitations &amp; game files</span>
							<span className="start-screen__chevron" aria-hidden="true" />
						</summary>
						<div className="start-screen__information">
							<section>
								<h2>Controls</h2>
								<p>
									Best with a mouse and keyboard. Touch controls are available; landscape gives the
									game more room on phones.
								</p>
							</section>
							<section>
								<h2>Saves &amp; online play</h2>
								<p>
									Saves stay in this browser. Export through Manage Saves before clearing browser
									data. Online multiplayer is experimental.
								</p>
							</section>
							<section className="start-screen__game-files">
								<h2>Game files &amp; origins</h2>
								<p>
									Full game data is not included. Use your own copy of Diablo, available from{" "}
									<a href="https://www.gog.com/game/diablo" target="_blank" rel="noopener noreferrer">
										GOG
									</a>
									.
								</p>
								<p>
									Based on DiabloWeb and the engine reconstructed by GalaXyHaXz and the devilution
									team.
								</p>
								<button
									disabled={disabled}
									type="button"
									className="start-screen__utility"
									onClick={onCompressMpq}
								>
									Compress an MPQ to reduce its size <span aria-hidden="true">→</span>
								</button>
							</section>
						</div>
					</details>
				</div>
			</div>
		</section>
	);
};
export default StartScreen;
