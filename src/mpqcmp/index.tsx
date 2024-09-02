import React, { ChangeEvent } from "react";
import compress from "./compress";
import { IProgress } from "../types";

interface IProps {
	api: {
		setState: (state: { compress: boolean }) => void;
		onError: (message: string, stack: string) => void;
	};
}

interface IState {
	url?: string;
	started?: boolean;
	progress?: IProgress;
}

export default class CompressMpq extends React.Component<IProps, IState> {
	state: IState = {};

	parseFile = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			this.start(file);
		}
	};

	onProgress = (progress: IProgress) => {
		this.setState({ progress });
	};

	onDone = (blob: Blob) => {
		const url = URL.createObjectURL(blob);
		this.setState({ url });

		const link = document.createElement("a");
		link.href = url;
		link.download = "DIABDAT.MPQ";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	onError = (message: string, stack: string) => {
		this.props.api.setState({ compress: false });
		this.props.api.onError(message, stack);
	};

	onClose = () => {
		if (this.state.url) {
			URL.revokeObjectURL(this.state.url);
		}
		this.props.api.setState({ compress: false });
	};

	start = (file: File) => {
		this.setState({ started: true });
		compress(file, (text, loaded, total) => this.onProgress({ text, loaded: loaded || 0, total }))
			.then(this.onDone)
			.catch((e) => this.onError(e.message, e.stack));
	};

	render() {
		const { url, started, progress } = this.state;

		if (url) {
			return (
				<div className="start">
					<p>
						<a href={url} download="DIABDAT.MPQ">
							Click here if download doesn't start.
						</a>
					</p>
					<div className="startButton" onClick={this.onClose}>
						Back
					</div>
				</div>
			);
		}

		if (started) {
			return (
				<div className="loading">
					{progress?.text || "Processing..."}
					{progress && progress.total && (
						<span className="progressBar">
							<span>
								<span
									style={{
										width: `${Math.round((100 * progress.loaded) / progress.total)}%`,
									}}
								/>
							</span>
						</span>
					)}
				</div>
			);
		}

		return (
			<div className="start">
				<p>
					You can use this tool to reduce the original MPQ to about half its size. It encodes sounds in MP3
					format and uses better compression for regular files. To begin, click the button below or drop the
					MPQ onto the page.
				</p>
				<form>
					<label htmlFor="loadFile" className="startButton">
						Select MPQ
					</label>
					<input
						accept=".mpq"
						type="file"
						id="loadFile"
						style={{ display: "none" }}
						onChange={this.parseFile}
					/>
				</form>
				<div className="startButton" onClick={this.onClose}>
					Back
				</div>
			</div>
		);
	}
}
