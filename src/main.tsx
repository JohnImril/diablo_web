import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import * as serviceWorker from "./serviceWorker";
import App from "./App";

import "./index.css";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>
);

serviceWorker.register({
	onUpdate() {},
});
