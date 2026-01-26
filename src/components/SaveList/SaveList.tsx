import cn from "classnames";
import type { IPlayerInfo } from "../../types";

import "./SaveList.css";

interface IProps {
	saveNames: Record<string, IPlayerInfo | null>;
	onDownload: (name: string) => void;
	onDelete: (name: string) => void;
	onSelect: (name: string) => void;
	onUploadSave: (file: File) => void;
	onBack: () => void;
}

const SaveList = ({ saveNames, onDownload, onDelete, onUploadSave, onBack }: IProps) => {
	const plrClass = ["Warrior", "Rogue", "Sorcerer"];

	return (
		<section
			className={cn("save-list", "u-center-abs", "u-modal", "u-scrollbar-gold", "d1-panel")}
			role="dialog"
			aria-modal="true"
			aria-label="Manage save files"
		>
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
							<button
								type="button"
								className={cn("d1-btn", "d1-iconbtn")}
								title="Download"
								onClick={() => onDownload(name)}
								aria-label={`Download save ${name}`}
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
							</button>

							<button
								type="button"
								className={cn("d1-btn", "d1-iconbtn", "d1-btn--ruby")}
								title="Delete"
								onClick={() => onDelete(name)}
								aria-label={`Delete save ${name}`}
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
							</button>
						</div>
					</li>
				))}
			</ul>

			<form className="save-list__form">
				<label htmlFor="loadSave" className={cn("save-list__button", "d1-btn")}>
					Upload Save
				</label>
				<input
					accept=".sv"
					type="file"
					id="loadSave"
					style={{ display: "none" }}
					onChange={(e) => {
						const files = e.target.files;
						if (files && files.length > 0) {
							onUploadSave(files[0]);
							e.target.value = "";
						}
					}}
				/>
			</form>

			<button type="button" className={cn("save-list__button", "d1-btn", "d1-btn--gold")} onClick={onBack}>
				Back
			</button>
		</section>
	);
};

export default SaveList;
