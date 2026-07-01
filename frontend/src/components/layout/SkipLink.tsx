/**
 * Skip-to-main-content link for keyboard navigation.
 * Visually hidden until focused, allowing keyboard users to bypass
 * repetitive navigation content (WCAG 2.4.1).
 */
function SkipLink() {
	return (
		<a
			className="bg-background text-foreground border-primary sr-only fixed top-2 left-2 z-[100] rounded-md border px-4 py-2 text-sm font-medium shadow-lg focus:not-sr-only"
			href="#main-content">
			Skip to main content
		</a>
	);
}

export { SkipLink };
