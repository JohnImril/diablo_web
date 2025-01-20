import { useEffect, useState } from "react";

export const useKeyboardRule = (): CSSStyleRule | null => {
	const [keyboardRule, setKeyboardRule] = useState<CSSStyleRule | null>(null);

	useEffect(() => {
		try {
			const rule = findKeyboardRule();
			setKeyboardRule(rule);
		} catch (error) {
			console.error(error);
		}
	}, []);

	return keyboardRule;
};

function findKeyboardRule() {
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
