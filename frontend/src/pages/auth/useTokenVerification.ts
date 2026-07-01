import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Hook encapsulating the common token-verification flow shared by
 * ConfirmEmailChangePage and VerifyEmailPage:
 *   1. Extract token from URL search params (captured once on mount).
 *   2. Strip the token from browser history via replaceState.
 *   3. Fire a single mutation guarded by a processedRef.
 *
 * Consumers supply their own mutation function and receive the resulting
 * isPending / isSuccess / isInvalid state to drive page-specific rendering.
 */
function useTokenVerification(mutateFn: (token: string) => Promise<unknown>) {
	const [searchParams] = useSearchParams();
	const [token] = useState(() => searchParams.get('token') ?? '');

	useEffect(() => {
		const url = new URL(window.location.href);
		if (url.searchParams.has('token')) {
			url.searchParams.delete('token');
			window.history.replaceState(null, '', url.pathname + url.search);
		}
	}, []);

	const processedRef = useRef(false);

	const { isPending, isSuccess, mutate } = useMutation({
		mutationFn: mutateFn,
	});

	useEffect(() => {
		if (processedRef.current) return;
		processedRef.current = true;
		if (token) mutate(token);
	}, [token, mutate]);

	return { isInvalid: !token, isPending, isSuccess };
}

export { useTokenVerification };
