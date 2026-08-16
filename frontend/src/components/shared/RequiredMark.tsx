/**
 * The required marker for a form label.
 *
 * Hidden from assistive technology on purpose: the control it belongs to carries `required`, which
 * screen readers already announce, and a spoken "asterisk" after every label is noise. This is the
 * visual half of that same fact.
 *
 * `-ms-1.5` pulls the mark back onto its label. `Label` is a flex row with `gap-2` and callers
 * additionally write a literal space before this component, so the asterisk was landing ~8px clear
 * of the last glyph — "SMTP Host   *" reads as a floating mark rather than as part of the label.
 * Corrected here rather than at the call sites so every required field moves together, and by
 * negative margin rather than by dropping Label's `gap-2`, which is doing real work for the labels
 * that hold a control or a badge beside their text.
 */
function RequiredMark() {
	return (
		<span aria-hidden="true" className="-ms-1.5 text-destructive">
			*
		</span>
	);
}

export { RequiredMark };
