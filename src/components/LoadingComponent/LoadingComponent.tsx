import cn from "classnames";

import type { IProgress } from "../../types";

import "./LoadingComponent.css";

interface IProps {
	title: string;
	progress?: IProgress;
}

const LoadingComponent = ({ title, progress }: IProps) => {
	return (
		<section
			className={cn("loading-component", "u-center-abs", "u-modal")}
			aria-busy="true"
			aria-live="polite"
			aria-label={progress?.text || title}
		>
			<span className={cn("loading-component__text", "text-gold")}>{progress?.text || title}</span>

			{typeof progress?.total === "number" && (
				<progress
					className={cn("d1-progress", "loading-component__progress")}
					value={progress.loaded}
					max={progress.total}
				/>
			)}
		</section>
	);
};

export default LoadingComponent;
