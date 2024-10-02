import { IPlayerInfo } from "../../types";

const StartScreen: React.FC<{
	hasSpawn: boolean;
	start: (file?: File | null) => void;
	saveNames: boolean | Record<string, IPlayerInfo | null>;
	setCompress: React.Dispatch<React.SetStateAction<boolean>>;
	setShowSaves: React.Dispatch<React.SetStateAction<boolean>>;
	updateSaves: () => Promise<void>;
}> = ({ hasSpawn, start, saveNames, setCompress, setShowSaves, updateSaves }) => {
	return (
		<div className="start">
			<p>
				This is a web port of the original Diablo game, based on source code reconstructed by GalaXyHaXz and
				devilution team. The project page with information and links can be found over here{" "}
				<a target="_blank" rel="noopener noreferrer" href="https://github.com/JohnImril/diablo_web">
					https://github.com/JohnImril/diablo_web
				</a>
			</p>
			<p>
				If you own the original game, you can drop the original DIABDAT.MPQ onto this page or click the button
				below to start playing. The game can be purchased from{" "}
				<a target="_blank" rel="noopener noreferrer" href="https://www.gog.com/game/diablo">
					GoG
				</a>
				.{" "}
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
					onChange={(e) => {
						const files = e.target.files;
						if (files && files.length > 0) {
							start(files[0]);
						}
					}}
				/>
			</form>
			<div className="startButton" onClick={() => start()}>
				Play Shareware
			</div>
			{!!saveNames && (
				<div
					className="startButton"
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
		</div>
	);
};

export default StartScreen;
