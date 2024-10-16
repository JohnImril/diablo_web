import { IFileSystem, IPlayerInfo } from "../../types";

import "./SaveList.css";

const SaveList: React.FC<{
	saveNames: Record<string, IPlayerInfo | null>;
	fs: Promise<IFileSystem>;
	updateSaves: () => Promise<void>;
	setShowSaves: React.Dispatch<React.SetStateAction<boolean>>;
	start: (file?: File | null) => void;
}> = ({ saveNames, fs, updateSaves, setShowSaves, start }) => {
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
							<div
								className="btnDownload"
								onClick={() => fs.then((fsInstance: any) => fsInstance.download(name))}
							>
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
							<div
								className="btnRemove"
								onClick={() => {
									if (window.confirm(`Are you sure you want to delete ${name}?`)) {
										(async () => {
											const fsInstance = await fs;
											await fsInstance.delete(name.toLowerCase());
											fsInstance.files.delete(name.toLowerCase());
											updateSaves();
										})();
									}
								}}
							>
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
					onChange={(e) => {
						const files = e.target.files;
						if (files && files.length > 0) {
							start(files[0]);
						}
					}}
				/>
			</form>
			<div className="startButton" onClick={() => setShowSaves(false)}>
				Back
			</div>
		</div>
	);
};

export default SaveList;