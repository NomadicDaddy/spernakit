import { useEffect, useRef, useState } from 'react';

/**
 * Hook that tracks the width of a container DOM element.
 *
 * Uses a `requestAnimationFrame`-batched setState so that ResizeObserver
 * callbacks collapse to a single state update per frame. This is required
 * to avoid infinite render loops when the container hosts a recharts v3
 * chart under React 19 + StrictMode + React Compiler — recharts' internal
 * re-measure would otherwise re-trigger the observer inside the same render
 * phase.
 *
 * @returns A tuple of `[ref, width]`. Attach the ref to the element whose
 * width you want to track; `width` is the current `clientWidth` (rounded).
 */
function useContainerWidth(): [React.RefObject<HTMLDivElement | null>, number] {
	const ref = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		let rafId: null | number = null;

		const schedule = (next: number) => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				rafId = null;
				setWidth(next);
			});
		};

		schedule(Math.round(el.clientWidth));

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				schedule(Math.round(entry.contentRect.width));
			}
		});
		observer.observe(el);

		return () => {
			observer.disconnect();
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	}, []);

	return [ref, width];
}

export { useContainerWidth };
