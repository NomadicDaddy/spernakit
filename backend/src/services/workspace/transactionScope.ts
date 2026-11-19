/**
 * A view of a transaction that stops working once the code it was lent to has returned.
 *
 * Every object reached through the view (a query builder, a prepared statement, a result) is
 * wrapped the same way, so a statement built during the call and run later is refused, not just a
 * later call on the transaction itself. After the scope closes, the connection is back in
 * autocommit, and a deferred write would land outside the transaction it was meant for.
 *
 * It guards against accidental deferral, not deliberate escape: code set on reaching the real
 * session (through property descriptors or prototypes, which are not trapped) still can.
 */

interface TransactionScope<T extends object> {
	/** End the scope: from now on, any use of the view or anything reached through it throws. */
	close: () => void;
	/** The view to hand out in place of the real transaction. */
	view: T;
}

/**
 * Wrap `target` so it and everything reached through it can be closed together.
 *
 * @param target - The transaction (or any object) to lend out
 * @param closedError - Builds the error thrown when the view is used after close
 * @returns The view and the function that closes it
 */
function openTransactionScope<T extends object>(
	target: T,
	closedError: () => Error,
): TransactionScope<T> {
	let closed = false;
	const views = new WeakMap<object, object>();
	const originals = new WeakMap<object, object>();

	const guard = (): void => {
		if (closed) throw closedError();
	};
	const unwrap = (value: unknown): unknown =>
		typeof value === 'object' || typeof value === 'function'
			? (value !== null && originals.get(value)) || value
			: value;

	function wrap(value: unknown): unknown {
		if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
			return value;
		}
		const existing = views.get(value);
		if (existing) return existing;
		const view = new Proxy<object>(value, {
			apply(fn, thisArg, args: unknown[]) {
				guard();
				const callable = fn as (...callArgs: unknown[]) => unknown;
				return wrap(Reflect.apply(callable, unwrap(thisArg), args.map(unwrap)));
			},
			get(object, key) {
				guard();
				const property = Reflect.get(object, key, object);
				// A proxy must return a frozen property exactly as it is.
				const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
				if (descriptor && !descriptor.configurable && descriptor.writable === false) {
					return property;
				}
				return wrap(property);
			},
		});
		views.set(value, view);
		originals.set(view, value);
		return view;
	}

	return {
		close: () => {
			closed = true;
		},
		view: wrap(target) as T,
	};
}

export { openTransactionScope };
export type { TransactionScope };
