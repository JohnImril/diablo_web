import { type RefObject } from "react";
import cn from "classnames";

import { TOUCH } from "../../constants/controls";

interface IProps {
	enabled: boolean;
	touchButtons: RefObject<(HTMLDivElement | null)[]>;
}

const TouchControls = ({ enabled, touchButtons }: IProps) => {
	if (!enabled) return null;

	return (
		<>
			<section className="app__touch-ui app__touch-ui--mods" aria-hidden="true">
				{TOUCH.MOD_INDICES.map((i) => (
					<div
						key={i}
						className={cn("d1-btn d1-iconbtn app__touch-button", `app__touch-button--${i}`)}
						ref={(el) => {
							touchButtons.current![i] = el;
						}}
					/>
				))}
			</section>

			<section className="app__touch-ui app__touch-ui--belt" aria-hidden="true">
				{TOUCH.BELT_SLOTS.map((slotIdx) => (
					<div
						key={TOUCH.BUTTON_START_BELT + slotIdx}
						className={cn("d1-btn", "d1-iconbtn", "app__touch-button", `app__touch-button--${slotIdx}`)}
						ref={(el) => {
							const buttonIndex = TOUCH.BUTTON_START_BELT + slotIdx;
							touchButtons.current[buttonIndex] = el;
						}}
					/>
				))}
			</section>

			<section className="app__touch-ui app__touch-ui--fkeys-left" aria-hidden="true">
				{TOUCH.FKEY_LEFT_INDICES.map((idx) => (
					<div
						key={`fkeys-left-${idx}`}
						className={cn(
							"d1-btn",
							"d1-iconbtn",
							"app__touch-button",
							`app__touch-button--${idx - TOUCH.BUTTON_START_BELT}`
						)}
						ref={(el) => {
							touchButtons.current![idx] = el;
						}}
					/>
				))}
			</section>

			<section className="app__touch-ui app__touch-ui--fkeys-right" aria-hidden="true">
				{TOUCH.FKEY_RIGHT_INDICES.map((idx) => (
					<div
						key={`fkeys-right-${idx}`}
						className={cn(
							"d1-btn",
							"d1-iconbtn",
							"app__touch-button",
							`app__touch-button--${idx - TOUCH.BUTTON_START_BELT}`
						)}
						ref={(el) => {
							touchButtons.current![idx] = el;
						}}
					/>
				))}
			</section>
		</>
	);
};

export default TouchControls;
