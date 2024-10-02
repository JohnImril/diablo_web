import { IProgress } from "../../types";

const LoadingComponent: React.FC<{
	progress?: IProgress;
}> = ({ progress }) => {
	return (
		<div className="loading">
			{progress?.text || "Loading..."}
			{progress != null && !!progress.total && (
				<span className="progressBar">
					<span>
						<span
							style={{
								width: `${Math.round((100 * progress.loaded!) / progress.total)}%`,
							}}
						/>
					</span>
				</span>
			)}
		</div>
	);
};

export default LoadingComponent;
