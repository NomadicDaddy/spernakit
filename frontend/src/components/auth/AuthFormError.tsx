/** Inline form error message for auth pages. */
function AuthFormError({ error, isPending }: { error: null | string; isPending: boolean }) {
	if (!error || isPending) return null;

	return (
		<p aria-live="polite" className="text-destructive text-center text-sm" role="alert">
			{error}
		</p>
	);
}

export { AuthFormError };
