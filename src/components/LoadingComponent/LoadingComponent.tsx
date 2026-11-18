import cn from "classnames";

import type { IProgress } from "../../types";

import "./LoadingComponent.css";

interface IProps {
	title: string;
	progress?: IProgress;
	embedded?: boolean;
}

const LoadingComponent = ({ title, progress, embedded = false }: IProps) => {
	return (
		<section
			className={cn("loading-component", !embedded && "u-center-abs u-modal d1-panel")}
			aria-label={progress?.text || title}
		>
			<span role="status" className={cn("loading-component__text", "text-gold")}>
				{progress?.text || title}
			</span>

			{typeof progress?.total === "number" && (
				<progress
					className={cn("d1-progress", "loading-component__progress")}
					aria-label={progress.text || title}
					value={
						progress.total > 0 && typeof progress.loaded === "number"
							? Math.max(0, Math.min(progress.loaded, progress.total))
							: undefined
					}
					max={progress.total > 0 ? progress.total : undefined}
				/>
			)}
		</section>
	);
};

export default LoadingComponent;
