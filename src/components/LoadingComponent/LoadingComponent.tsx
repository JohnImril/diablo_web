import React from "react";
import { IProgress } from "../../types";

import "./LoadingComponent.css";

const LoadingComponent: React.FC<{
	title: string;
	progress?: IProgress;
}> = ({ title, progress }) => {
	return (
		<div className="loading-component">
			<span className="loading-component__text">{progress?.text || title}</span>
			{progress?.total && (
				<progress className="loading-component__progress" value={progress.loaded} max={progress.total} />
			)}
		</div>
	);
};

export default LoadingComponent;
