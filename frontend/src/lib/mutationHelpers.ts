import type { QueryClient } from '@tanstack/react-query';

import { getSafeErrorMessage } from '@/api/errorHandling';
import { lazyToast } from '@/lib/lazyToast';

/**
 * Build standard onError/onSuccess callbacks for useMutation.
 *
 * Covers the common pattern: toast on error, toast + cache invalidation on success.
 * Spread the return value into useMutation options:
 *
 * ```ts
 * const mutation = useMutation({
 *   mutationFn: (id: number) => deleteItem(id),
 *   ...stdCallbacks(queryClient, {
 *     errorMessage: 'Failed to delete item',
 *     invalidateKeys: [['items']],
 *     successMessage: 'Item deleted',
 *   }),
 * });
 * ```
 */
function stdCallbacks(
	queryClient: QueryClient,
	opts: {
		/** Fallback error message shown in toast when mutation fails. */
		errorMessage: string;
		/** Query key arrays to invalidate on success. */
		invalidateKeys?: readonly (readonly unknown[])[];
		/** Additional callback after success toast and invalidation. */
		onSuccess?: () => void;
		/** Success message shown in toast. */
		successMessage: string;
	}
) {
	return {
		onError: (err: Error) => {
			lazyToast.error(getSafeErrorMessage(err, opts.errorMessage));
		},
		onSuccess: () => {
			lazyToast.success(opts.successMessage);
			if (opts.invalidateKeys) {
				for (const key of opts.invalidateKeys) {
					void queryClient.invalidateQueries({ queryKey: [...key] });
				}
			}
			opts.onSuccess?.();
		},
	};
}

/**
 * Build standard onError/onSuccess callbacks for bulk useMutation operations.
 *
 * Covers the common pattern: toast on error, succeeded/failed count reporting
 * with warning vs. success toast, cache invalidation on success.
 *
 * ```ts
 * const mutation = useMutation({
 *   mutationFn: (ids: number[]) => bulkDeleteItems(ids),
 *   ...bulkCallbacks(queryClient, {
 *     action: 'Deleted',
 *     errorMessage: 'Failed to delete items',
 *     invalidateKeys: [['items']],
 *     itemLabel: 'items',
 *   }),
 * });
 * ```
 */
function bulkCallbacks(
	queryClient: QueryClient,
	opts: {
		/** Past-tense verb for the operation, e.g. 'Deleted', 'Updated', 'Added'. */
		action: string;
		/** Fallback error message shown in toast when mutation fails. */
		errorMessage: string;
		/** Query key arrays to invalidate on success. */
		invalidateKeys: readonly (readonly unknown[])[];
		/** Noun label for affected items, e.g. 'users', 'members', 'roles'. */
		itemLabel: string;
	}
) {
	return {
		onError: (err: Error) => {
			lazyToast.error(getSafeErrorMessage(err, opts.errorMessage));
		},
		onSuccess: (response: { data: { failed: number; succeeded: number } }) => {
			const { failed, succeeded } = response.data;
			if (failed > 0) {
				lazyToast.warning(
					`${opts.action} ${succeeded} ${opts.itemLabel}, ${failed} failed`
				);
			} else {
				lazyToast.success(`${opts.action} ${succeeded} ${opts.itemLabel}`);
			}
			for (const key of opts.invalidateKeys) {
				void queryClient.invalidateQueries({ queryKey: [...key] });
			}
		},
	};
}

export { bulkCallbacks, stdCallbacks };
