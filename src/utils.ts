import { IError } from "./types";

export function reportLink(e: IError, retail?: boolean) {
	const message = (e.message || "Unknown error") + (e.stack ? "\n" + e.stack : "");
	const url = new URL("https://github.com/JohnImril/diablo_web/issues/new");
	url.searchParams.set(
		"body",
		`**Description:**
[Please describe what you were doing before the error occurred]

**App version:**
DiabloWeb ${import.meta.env.VERSION} (${retail ? "Retail" : "Shareware"})

**Error message:**
    
${message
	.split("\n")
	.map((line) => "    " + line)
	.join("\n")}

**User agent:**

    ${navigator.userAgent}

**Save file:**
[Please attach the save file, if applicable. The error box should have a link to download the current save you were playing; alternatively, you can open dev console on the game page (F12) and type in ${"`DownloadSaves()`"}]
`
	);
	return url.toString();
}

export function isDropFile(e: DragEvent) {
	if (e.dataTransfer?.items) {
		for (let i = 0; i < e.dataTransfer.items.length; ++i) {
			if (e.dataTransfer.items[i].kind === "file") {
				return true;
			}
		}
	}
	if (e.dataTransfer?.files.length) {
		return true;
	}
	return false;
}

export function getDropFile(e: DragEvent) {
	if (e.dataTransfer?.items) {
		for (let i = 0; i < e.dataTransfer.items.length; ++i) {
			if (e.dataTransfer.items[i].kind === "file") {
				return e.dataTransfer.items[i].getAsFile();
			}
		}
	}
	return e.dataTransfer?.files.length ? e.dataTransfer.files[0] : null;
}

export function findKeyboardRule() {
	for (const sheet of document.styleSheets) {
		for (const rule of sheet.cssRules) {
			if (rule instanceof CSSMediaRule && rule.conditionText === "(min-aspect-ratio: 3/1)") {
				for (const sub of rule.cssRules) {
					if (sub instanceof CSSStyleRule && sub.selectorText === ".App.keyboard .Body .inner") {
						return sub;
					}
				}
			}
		}
	}
	return null;
}
