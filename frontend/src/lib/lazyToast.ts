/**
 * Lazy toast adapter.
 *
 * Sonner is a single ES module that exports both the stateless `toast()` caller
 * and the `Toaster` rendering component. Importing `toast` statically pulls the
 * entire module — including all of its rendering code (~22 KB gzip) — into
 * whichever chunk the caller lands in. Several components and hooks that live
 * in the eager AppShell dependency tree (`useNotificationSocket`,
 * `ImpersonationBanner`, `BugReportButton`, `mutationHelpers`, etc.) call
 * `toast`, so a static import would force sonner onto every first page load
 * even though toasts only fire after user actions or API responses.
 *
 * This adapter defers the sonner import until the first toast is actually
 * requested, so the module lands in a lazy chunk instead of the entry or
 * `react-core` chunk. The Toaster component (rendered in `App.tsx` via the
 * lazy `@/components/ui/sonner`) subscribes to the same singleton state.
 */

/** Options accepted by toast calls that support a description. */
interface ToastOptions {
	description?: string;
}

/** Shape of the toast function returned by sonner — only the methods used here. */
interface ToastLike {
	(message: string, opts?: ToastOptions): void;
	error: (message: string, opts?: ToastOptions) => void;
	info: (message: string, opts?: ToastOptions) => void;
	success: (message: string, opts?: ToastOptions) => void;
	warning: (message: string, opts?: ToastOptions) => void;
}

/**
 * A callable toast that buffers calls until sonner has loaded, then forwards
 * them. The proxy avoids forcing every call site to await — callers that
 * already used `toast.error(x)` can write `lazyToast.error(x)` with no change
 * in control flow.
 */
interface LazyToast {
	(message: string, opts?: ToastOptions): void;
	error: (message: string, opts?: ToastOptions) => void;
	info: (message: string, opts?: ToastOptions) => void;
	success: (message: string, opts?: ToastOptions) => void;
	warning: (message: string, opts?: ToastOptions) => void;
}

let toastPromise: null | Promise<ToastLike> = null;

function loadToast(): Promise<ToastLike> {
	if (!toastPromise) {
		toastPromise = import('sonner').then((m): ToastLike => m.toast as unknown as ToastLike);
	}
	return toastPromise;
}

/** Fire-and-forget wrapper around `toast(message, opts)`. */
function show(message: string, opts?: ToastOptions): void {
	void loadToast().then((t) => t(message, opts));
}

/** Fire-and-forget wrapper around `toast.error(message, opts)`. */
function error(message: string, opts?: ToastOptions): void {
	void loadToast().then((t) => t.error(message, opts));
}

/** Fire-and-forget wrapper around `toast.info(message, opts)`. */
function info(message: string, opts?: ToastOptions): void {
	void loadToast().then((t) => t.info(message, opts));
}

/** Fire-and-forget wrapper around `toast.success(message, opts)`. */
function success(message: string, opts?: ToastOptions): void {
	void loadToast().then((t) => t.success(message, opts));
}

/** Fire-and-forget wrapper around `toast.warning(message, opts)`. */
function warning(message: string, opts?: ToastOptions): void {
	void loadToast().then((t) => t.warning(message, opts));
}

/** Lazy toast — drop-in for sonner's `toast` that defers the module import. */
const lazyToast: LazyToast = Object.assign(show, { error, info, success, warning });

export { lazyToast, loadToast };
