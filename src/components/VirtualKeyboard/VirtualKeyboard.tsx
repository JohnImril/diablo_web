import { type CSSProperties, type RefObject } from "react";

type VirtualKeyboardProps = {
	keyboardRef: RefObject<HTMLInputElement | null>;
	keyboardStyle: CSSProperties | null;
	onInput: (blur: boolean) => void;
};

const VirtualKeyboard = ({ keyboardRef, keyboardStyle, onInput }: VirtualKeyboardProps) => {
	return (
		<input
			type="text"
			className="app__keyboard"
			id="virtual-keyboard-input"
			aria-label="Virtual keyboard input"
			ref={keyboardRef}
			onChange={() => onInput(false)}
			onBlur={() => onInput(true)}
			spellCheck={false}
			style={keyboardStyle || {}}
		/>
	);
};

export default VirtualKeyboard;
