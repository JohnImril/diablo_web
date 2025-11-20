import cn from "classnames";
import type { IProgress } from "../../types";

import "./LoadingComponent.css";

interface IProps {
	title: string;
	progress?: IProgress;
}

const LoadingComponent = ({ title, progress }: IProps) => {
	return (
		<div className={cn("loading-component", "u-center-abs", "u-modal")}>
			<span className={cn("loading-component__text", "text-gold")}>{progress?.text || title}</span>

			{typeof progress?.total === "number" && (
				<progress
					className={cn("d1-progress", "loading-component__progress")}
					value={progress.loaded}
					max={progress.total}
				/>
			)}
		</div>
	);
};

export default LoadingComponent;
