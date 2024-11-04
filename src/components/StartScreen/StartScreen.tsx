import { IPlayerInfo } from "../../types";

import "./StartScreen.css";

const StartScreen: React.FC<{
	hasSpawn: boolean;
	start: (file?: File | null) => void;
	saveNames: boolean | Record<string, IPlayerInfo | null>;
	setCompress: React.Dispatch<React.SetStateAction<boolean>>;
	setShowSaves: React.Dispatch<React.SetStateAction<boolean>>;
	updateSaves: () => Promise<void>;
}> = ({ hasSpawn, start, saveNames, setCompress, setShowSaves, updateSaves }) => {
	return (
		<div className="start-screen">
			<p className="start-screen__description">
				This is a web port of the original Diablo game, based on source code reconstructed by GalaXyHaXz and
				devilution team. The project page with information and links can be found over here{" "}
				<a
					className="start-screen__link"
					target="_blank"
					rel="noopener noreferrer"
					href="https://github.com/JohnImril/diablo_web"
				>
					https://github.com/JohnImril/diablo_web
				</a>
			</p>
			<p className="start-screen__description">
				If you own the original game, you can drop the original DIABDAT.MPQ onto this page or click the button
				below to start playing. The game can be purchased from{" "}
				<a
					className="start-screen__link"
					target="_blank"
					rel="noopener noreferrer"
					href="https://www.gog.com/game/diablo"
				>
					GoG
				</a>
				.{" "}
				<span className="start-screen__compress-link" onClick={() => setCompress(true)}>
					Click here to compress the MPQ, greatly reducing its size.
				</span>
			</p>
			{!hasSpawn && (
				<p className="start-screen__description">
					Or you can play the shareware version for free (50MB download).
				</p>
			)}
			<form className="start-screen__form">
				<label htmlFor="loadFile" className="start-screen__button">
					Select MPQ
				</label>
				<input
					accept=".mpq"
					type="file"
					id="loadFile"
					style={{ display: "none" }}
					onChange={(e) => {
						const files = e.target.files;
						if (files && files.length > 0) {
							start(files[0]);
						}
					}}
				/>
			</form>
			<div className="start-screen__button" onClick={() => start()}>
				Play Shareware
			</div>
			{!!saveNames && (
				<div
					className="start-screen__button"
					onClick={() => {
						if (saveNames === true) {
							updateSaves().then(() => setShowSaves((prev) => !prev));
						} else {
							setShowSaves((prev) => !prev);
						}
					}}
				>
					Manage Saves
				</div>
			)}
			<div className="start-screen__button" onClick={() => start()}>
				Beta: Play with my server
			</div>
		</div>
	);
};

export default StartScreen;
