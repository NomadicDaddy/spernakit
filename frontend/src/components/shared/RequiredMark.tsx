/**
 * The required marker for a form label.
 *
 * Hidden from assistive technology on purpose: the control it belongs to carries `required`, which
 * screen readers already announce, and a spoken "asterisk" after every label is noise. This is the
 * visual half of that same fact.
 */
function RequiredMark() {
	return (
		<span aria-hidden="true" className="text-destructive">
			*
		</span>
	);
}

export { RequiredMark };
