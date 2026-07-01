import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { DataResponse, UserRole } from '@/api/types';

import { apiClient } from '@/api/client';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@/lib/validation';

interface ProfileUser {
	email: string;
	id: number;
	role: UserRole;
	username: string;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const USERNAME_DEBOUNCE_MS = 400;

export type { ProfileUser };

export function useProfile() {
	return useQuery({
		queryFn: () => apiClient.get<DataResponse<ProfileUser>>('/auth/me'),
		queryKey: ['profile'],
	});
}

export type UsernameStatus = 'available' | 'checking' | 'idle' | 'invalid' | 'taken';

export function useUsernameCheck(currentUsername: string) {
	const [debouncedValue, setDebouncedValue] = useState('');
	const [clientStatus, setClientStatus] = useState<'idle' | 'invalid'>('idle');
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const queryClient = useQueryClient();

	const queryKey = ['username-check', debouncedValue] as const;

	const { data, isError, isFetching } = useQuery({
		enabled:
			debouncedValue.length >= 2 &&
			debouncedValue !== currentUsername &&
			clientStatus === 'idle',
		queryFn: () =>
			apiClient.get<DataResponse<{ available: boolean }>>(
				`/users/check-username/${encodeURIComponent(debouncedValue)}`
			),
		queryKey,
		retry: false,
		staleTime: STALE_TIME_SHORT,
		throwOnError: false,
	});

	function check(value: string) {
		clearTimeout(timerRef.current);

		if (value === currentUsername || value.trim() === '') {
			setDebouncedValue('');
			setClientStatus('idle');
			return;
		}

		if (
			value.length < USERNAME_MIN_LENGTH ||
			value.length > USERNAME_MAX_LENGTH ||
			!USERNAME_PATTERN.test(value)
		) {
			setDebouncedValue('');
			setClientStatus('invalid');
			return;
		}

		setClientStatus('idle');
		timerRef.current = setTimeout(() => {
			setDebouncedValue(value);
		}, USERNAME_DEBOUNCE_MS);
	}

	function reset() {
		clearTimeout(timerRef.current);
		setDebouncedValue('');
		setClientStatus('idle');
		queryClient.removeQueries({ queryKey: ['username-check'] });
	}

	useEffect(() => () => clearTimeout(timerRef.current), []);

	// Derive status from client validation + query state
	let status: UsernameStatus = 'idle';
	if (clientStatus === 'invalid') {
		status = 'invalid';
	} else if (debouncedValue && debouncedValue !== currentUsername) {
		if (isFetching) {
			status = 'checking';
		} else if (isError) {
			status = 'idle';
		} else if (data) {
			status = data.data.available ? 'available' : 'taken';
		}
	}

	return { check, reset, status };
}
