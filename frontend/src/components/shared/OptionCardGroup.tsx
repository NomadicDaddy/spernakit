import type { ReactNode } from 'react';

/** Which way each arrow key moves within the group. */
const ARROW_STEP: Record<string, number> = {
	ArrowDown: 1,
	ArrowLeft: -1,
	ArrowRight: 1,
	ArrowUp: -1,
};

interface OptionCardGroupProps {
	children: ReactNode;
	/** The grid or flex classes that lay the options out. */
	className?: string;
	/** The group's name, when no on-screen label element exists to point at. */
	label?: string;
	/** The id of the element naming this group — preferred over `label` when one is rendered. */
	labelledBy?: string;
}

/**
 * The container for a set of `OptionCard`s that form one single-select choice.
 *
 * Without it the accessibility tree showed what the design sweep found on /profile/preferences:
 * twelve loose toggle buttons — "Light", "Dark", "System", "Default", … — with no enclosing group,
 * no group name and no position-in-set, so a screen reader user was never told that the three
 * Theme buttons are mutually exclusive or that "System" is 1 of 3.
 *
 * Wrapping them in a real `radiogroup` is only half the job: the role promises arrow-key movement,
 * and a role that promises interaction it does not implement is worse than no role at all. So this
 * owns the roving tabstop the pattern requires — one Tab stop for the whole group, arrows to move
 * between options, Home/End to jump to the ends — with `OptionCard` supplying the matching
 * `tabIndex`. Selection follows focus, which is the expected behaviour for a radio group and is
 * what each of these groups already does on click.
 *
 * These groups are all backed by a store with a default, so exactly one option is always selected
 * and therefore always tabbable. A group whose value can be absent would need a first-option
 * fallback added here.
 */
function OptionCardGroup({ children, className, label, labelledBy }: OptionCardGroupProps) {
	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const options = Array.from(
			event.currentTarget.querySelectorAll<HTMLButtonElement>(
				'[role="radio"]:not([disabled])',
			),
		);
		const current = options.indexOf(document.activeElement as HTMLButtonElement);
		if (current === -1) return;

		let target: number;
		if (event.key === 'Home') {
			target = 0;
		} else if (event.key === 'End') {
			target = options.length - 1;
		} else {
			const step = ARROW_STEP[event.key];
			if (step === undefined) return;
			target = (current + step + options.length) % options.length;
		}

		const next = options[target];
		if (!next) return;
		event.preventDefault();
		next.focus();
		next.click();
	};

	return (
		<div
			className={className}
			onKeyDown={handleKeyDown}
			role="radiogroup"
			{...(label ? { 'aria-label': label } : {})}
			{...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}>
			{children}
		</div>
	);
}

export { OptionCardGroup };
