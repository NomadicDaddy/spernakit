import type { RefCallback } from 'react';

import { useCallback, useState } from 'react';

interface ContainerSize {
	height: number;
	width: number;
}

const ZERO_SIZE: ContainerSize = { height: 0, width: 0 };

/**
 * Hook that tracks the size of a container DOM element.
 *
 * What comes back is a **callback ref**, not a ref object, and that is the whole point. A container
 * that renders behind a loading guard does not exist yet on the mount where a `useEffect` runs, so
 * an effect-based observer reads a null ref, returns early, and — with an empty dependency array —
 * never runs again. The size stays 0 for the life of the page. React calls a callback ref at the
 * moment the element appears, however late that is.
 *
 * The first measurement is taken synchronously as the element attaches. That runs during commit,
 * before paint, so a consumer that waits for a non-zero size does not flash an empty frame.
 * Subsequent ResizeObserver callbacks go through a `requestAnimationFrame` batch so they collapse
 * to one state update per frame. That batching is load-bearing: without it a recharts v3 chart
 * inside the container re-measures under React 19 + StrictMode + React Compiler and re-triggers the
 * observer inside the same render phase, which loops.
 *
 * The state update bails out when neither dimension moved. A `{width, height}` object is a new
 * reference on every measurement, so an unconditional `setSize` would re-render on every observer
 * frame even when nothing changed — and a chart sized from that state would re-render with it.
 *
 * **Caller obligation.** Neither of the guards above can stop a feedback loop that runs through
 * layout rather than through React. If the observed element sits under a min-content-floored
 * ancestor and its child is given an explicit width taken from this hook, the child widens the
 * ancestor, the ancestor widens the observed element, and the next measurement is larger — a
 * ratchet that grows monotonically and never shrinks, one frame at a time, with every individual
 * update perfectly legitimate. Give the observed element `min-w-0 overflow-hidden` so it cannot
 * be sized by its own child. MetricChart carries exactly that for this reason.
 *
 * @returns A tuple of `[ref, size]`. Attach the ref to the element you want to track; `size` holds
 * the current `clientWidth`/`clientHeight` (rounded), or zeroes before the element exists.
 */
function useContainerSize(): [RefCallback<HTMLDivElement>, ContainerSize] {
	const [size, setSize] = useState<ContainerSize>(ZERO_SIZE);

	const ref = useCallback((element: HTMLDivElement | null) => {
		if (!element) return;

		let rafId: null | number = null;

		/*
		 * The observer entry is the trigger, not the measurement. `contentRect` is the content box
		 * and `clientWidth`/`clientHeight` are the padding box, so reading one here and the other
		 * on attach made the reported size jump by the element's padding the first time it resized
		 * — 48px on anything with the standard `px-6` card padding. Both paths read the client
		 * dimensions now, which is what this hook's contract has always said it returns. The read
		 * happens inside the frame callback, after layout, so it costs no extra reflow.
		 */
		const measure = () => {
			const height = Math.round(element.clientHeight);
			const width = Math.round(element.clientWidth);
			setSize((previous) =>
				previous.height === height && previous.width === width
					? previous
					: { height, width },
			);
		};

		const schedule = () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				rafId = null;
				measure();
			});
		};

		measure();

		const observer = new ResizeObserver(schedule);
		observer.observe(element);

		return () => {
			observer.disconnect();
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	}, []);

	return [ref, size];
}

/**
 * Width-only view of {@link useContainerSize}, for callers that give the tracked element a fixed
 * height in CSS and only need the horizontal measurement.
 *
 * @returns A tuple of `[ref, width]`.
 */
function useContainerWidth(): [RefCallback<HTMLDivElement>, number] {
	const [ref, size] = useContainerSize();

	return [ref, size.width];
}

export { useContainerSize, useContainerWidth };
export type { ContainerSize };
