import type { RefObject } from 'react';
import type { WidgetType } from 'spernakit-shared';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { getWidgetMinRows, WIDGET_WIDTH_MAX, WIDGET_WIDTH_MIN } from './widgetSize';

interface WidgetSizeFieldsProps {
	height: number;
	heightError: null | string;
	heightRef: RefObject<HTMLInputElement | null>;
	onHeightChange: (height: number) => void;
	onWidthChange: (width: number) => void;
	/** Drives the height floor — a chart needs more rows than a stat card to render at all. */
	widgetType: WidgetType;
	width: number;
	widthError: null | string;
	widthRef: RefObject<HTMLInputElement | null>;
}

/**
 * The Width and Height cells of the Add Widget dialog.
 *
 * Rendered as a fragment so the caller keeps ownership of the grid they sit in. The caller also
 * owns the error state and the refs, because it validates on submit and focuses the first
 * invalid field; see `widgetSize.ts` for the bounds these fields report against.
 */
export function WidgetSizeFields({
	height,
	heightError,
	heightRef,
	onHeightChange,
	onWidthChange,
	widgetType,
	width,
	widthError,
	widthRef,
}: WidgetSizeFieldsProps) {
	return (
		<>
			<div className="space-y-2">
				<Label htmlFor="widget-width">Width (cols)</Label>
				<Input
					aria-describedby={widthError ? 'widget-width-error' : undefined}
					autoComplete="off"
					id="widget-width"
					inputMode="numeric"
					max={WIDGET_WIDTH_MAX}
					min={WIDGET_WIDTH_MIN}
					onChange={(e) => onWidthChange(Number(e.target.value))}
					ref={widthRef}
					type="number"
					value={width}
					{...(widthError ? { 'aria-invalid': true } : {})}
				/>
				{widthError && (
					<p
						aria-live="polite"
						className="text-sm text-destructive"
						id="widget-width-error">
						{widthError}
					</p>
				)}
			</div>
			<div className="space-y-2">
				<Label htmlFor="widget-height">Height (rows)</Label>
				<Input
					aria-describedby={heightError ? 'widget-height-error' : undefined}
					autoComplete="off"
					id="widget-height"
					inputMode="numeric"
					min={getWidgetMinRows(widgetType)}
					onChange={(e) => onHeightChange(Number(e.target.value))}
					ref={heightRef}
					type="number"
					value={height}
					{...(heightError ? { 'aria-invalid': true } : {})}
				/>
				{heightError && (
					<p
						aria-live="polite"
						className="text-sm text-destructive"
						id="widget-height-error">
						{heightError}
					</p>
				)}
			</div>
		</>
	);
}
