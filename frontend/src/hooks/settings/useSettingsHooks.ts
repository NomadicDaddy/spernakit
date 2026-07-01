import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DataResponse, Setting } from '@/api/types';

import { apiClient } from '@/api/client';

export function useSettings() {
	return useQuery({
		queryFn: () => apiClient.get<DataResponse<Setting[]>>('/settings'),
		queryKey: ['settings'],
		staleTime: 60_000,
	});
}

export function useSaveSetting(extraInvalidations?: string[][]) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (update: { key: string; value: string }) =>
			apiClient.put<DataResponse<Setting>>(`/settings/${update.key}`, {
				body: { value: update.value },
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['settings'] });
			if (extraInvalidations) {
				for (const queryKey of extraInvalidations) {
					void queryClient.invalidateQueries({ queryKey });
				}
			}
		},
	});
}
