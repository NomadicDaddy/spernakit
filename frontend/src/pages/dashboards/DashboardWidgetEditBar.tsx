import type { KeyboardEvent } from 'react';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

type MoveDirection = 'down' | 'left' | 'right' | 'up';

interface DashboardWidgetEditBarProps {
	canMoveLeft: boolean;
	canMoveRight: boolean;
	canMoveUp: boolean;
	onMove: (direction: MoveDirection) => void;
	onRemove: () => void;
	/** Names every control for assistive tech: "Move Memory Usage left", "Remove Memory Usage". */
	widgetTitle: string;
}

/**
 * The edit-mode control strip above one widget.
 *
 * A reserved strip, not an overlay on top of the card. These controls were absolutely positioned
 * over the widget's own title row, which on a 2-row widget has 12px of padding to give.
 *
 * Real Buttons, so each control inherits the `icon-xs` target, the hover background and the app
 * focus ring. As bare 18px glyphs at 0.5 opacity they sat under the WCAG 2.2 target-size minimum,
 * and the disabled arrows at 0.25 were effectively invisible on a charcoal card.
 */
function DashboardWidgetEditBar({
	canMoveLeft,
	canMoveRight,
	canMoveUp,
	onMove,
	onRemove,
	widgetTitle,
}: DashboardWidgetEditBarProps) {
	const handleMoveKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		direction: MoveDirection,
	) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;

		event.preventDefault();
		onMove(direction);
	};

	return (
		<div className="mb-1 flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/50 px-1 py-0.5">
			<Button
				aria-label="Drag to reorder widget"
				className="widget-drag-handle cursor-grab"
				size="icon-xs"
				type="button"
				variant="ghost">
				<GripVertical aria-hidden="true" />
			</Button>
			<div className="flex items-center gap-0.5">
				<Button
					aria-label={`Move ${widgetTitle} left`}
					disabled={!canMoveLeft}
					onClick={() => onMove('left')}
					onKeyDown={(event) => handleMoveKeyDown(event, 'left')}
					size="icon-xs"
					type="button"
					variant="ghost">
					<ArrowLeft aria-hidden="true" />
				</Button>
				<Button
					aria-label={`Move ${widgetTitle} right`}
					disabled={!canMoveRight}
					onClick={() => onMove('right')}
					onKeyDown={(event) => handleMoveKeyDown(event, 'right')}
					size="icon-xs"
					type="button"
					variant="ghost">
					<ArrowRight aria-hidden="true" />
				</Button>
				<Button
					aria-label={`Move ${widgetTitle} up`}
					disabled={!canMoveUp}
					onClick={() => onMove('up')}
					onKeyDown={(event) => handleMoveKeyDown(event, 'up')}
					size="icon-xs"
					type="button"
					variant="ghost">
					<ArrowUp aria-hidden="true" />
				</Button>
				<Button
					aria-label={`Move ${widgetTitle} down`}
					onClick={() => onMove('down')}
					onKeyDown={(event) => handleMoveKeyDown(event, 'down')}
					size="icon-xs"
					type="button"
					variant="ghost">
					<ArrowDown aria-hidden="true" />
				</Button>
			</div>
			{/*
			 * The destructive action, painted as one. It carried exactly the weight of the four
			 * harmless move arrows, so the only cue separating "nudge this widget" from "delete this
			 * widget" was a 14px glyph.
			 */}
			<Button
				aria-label={`Remove ${widgetTitle}`}
				className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
				onClick={onRemove}
				size="icon-xs"
				type="button"
				variant="ghost">
				<X aria-hidden="true" />
			</Button>
		</div>
	);
}

export { DashboardWidgetEditBar };
export type { MoveDirection };
