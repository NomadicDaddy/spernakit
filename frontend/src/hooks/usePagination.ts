import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

interface UsePaginationResult {
	limit: number;
	page: number;
	resetPage: () => void;
	setLimit: (limit: number) => void;
	setPage: (page: number) => void;
}

function usePagination(defaultLimit = 20, syncToUrl = false): UsePaginationResult {
	const [searchParams, setSearchParams] = useSearchParams();
	const [localPage, setLocalPage] = useState(1);
	const [localLimit, setLocalLimit] = useState(defaultLimit);

	const page = syncToUrl ? Math.max(1, Number(searchParams.get('page')) || 1) : localPage;
	const limit = syncToUrl
		? Math.max(1, Number(searchParams.get('limit')) || defaultLimit)
		: localLimit;

	const setPage = (newPage: number) => {
		if (syncToUrl) {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (newPage <= 1) {
						next.delete('page');
					} else {
						next.set('page', String(newPage));
					}
					return next;
				},
				{ replace: true }
			);
		} else {
			setLocalPage(newPage);
		}
	};

	const setLimit = (newLimit: number) => {
		if (syncToUrl) {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (newLimit === defaultLimit) {
						next.delete('limit');
					} else {
						next.set('limit', String(newLimit));
					}
					next.delete('page');
					return next;
				},
				{ replace: true }
			);
		} else {
			setLocalLimit(newLimit);
			setLocalPage(1);
		}
	};

	const resetPage = () => {
		if (syncToUrl) {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					next.delete('page');
					return next;
				},
				{ replace: true }
			);
		} else {
			setLocalPage(1);
		}
	};

	return {
		limit,
		page,
		resetPage,
		setLimit,
		setPage,
	};
}

export { usePagination };
