import React from "react";
import { IProgress } from "../../types";

const LoadingComponent: React.FC<{
	title: string;
	progress?: IProgress;
}> = ({ title, progress }) => {
	return (
		<div className="loading">
			{progress?.text || title}
			{progress?.total && <progress value={progress.loaded} max={progress.total} />}
		</div>
	);
};

export default LoadingComponent;
