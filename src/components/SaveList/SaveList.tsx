import React from "react";
import cn from "classnames";
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
		<div className={cn("save-list", "u-center-abs", "u-modal", "u-scrollbar-gold", "d1-panel")}>
			<ul className="save-list__items">
				{Object.entries(saveNames).map(([name, info]) => (
					<li key={name} className="save-list__item">
						<div className="save-list__item-info">
							<div className={cn("save-list__item-name", "text-gold")}>{name}</div>
							{info ? (
								<div className="save-list__player-info">
									{info.name} (lv. {info.level} {plrClass[info.cls]})
								</div>
							) : null}
						</div>

						<div className="save-list__buttons">
							<div
								className={cn("d1-btn", "d1-iconbtn")}
								title="Download"
								onClick={() => fs.then((fsInstance: IFileSystem) => fsInstance.download(name))}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="currentColor"
									width="16"
									height="16"
									aria-hidden="true"
								>
									<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
								</svg>
							</div>

							<div
								className={cn("d1-btn", "d1-iconbtn", "d1-btn--ruby")}
								title="Delete"
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
									width="16"
									height="16"
									aria-hidden="true"
								>
									<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
								</svg>
							</div>
						</div>
					</li>
				))}
			</ul>

			<form className="save-list__form">
				<label htmlFor="loadFile" className={cn("save-list__button", "d1-btn")}>
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

			<div className={cn("save-list__button", "d1-btn", "d1-btn--gold")} onClick={() => setShowSaves(false)}>
				Back
			</div>
		</div>
	);
};

export default SaveList;
