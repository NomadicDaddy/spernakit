import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSmtpConfig, getEmailStatus, sendSmtpTestEmail, updateSmtpConfig } from '@/api/smtp';
import { useAuthorization } from '@/hooks/useAuthorization';
import { stdCallbacks } from '@/lib/mutationHelpers';

/**
 * Hook for email settings queries and mutations.
 */
export function useEmailSettings() {
	const { isSysop } = useAuthorization();
	const queryClient = useQueryClient();

	const { data: configData, isLoading: configLoading } = useQuery({
		enabled: isSysop(),
		queryFn: getSmtpConfig,
		queryKey: ['smtp-config'],
	});

	const { data: statusData, isLoading: statusLoading } = useQuery({
		queryFn: getEmailStatus,
		queryKey: ['email-status'],
	});

	const updateMutation = useMutation({
		mutationFn: (config: Parameters<typeof updateSmtpConfig>[0]) => updateSmtpConfig(config),
		...stdCallbacks(queryClient, {
			errorMessage: 'Failed to update SMTP configuration',
			successMessage: 'SMTP configuration updated successfully',
		}),
	});

	const testMutation = useMutation({
		mutationFn: (request: Parameters<typeof sendSmtpTestEmail>[0]) =>
			sendSmtpTestEmail(request),
		...stdCallbacks(queryClient, {
			errorMessage: 'Failed to send test email',
			successMessage: 'Test email sent successfully',
		}),
	});

	const config = configData?.data ?? {
		fromAddress: '',
		fromName: '',
		host: '',
		password: '',
		port: 0,
		secure: false,
		user: '',
	};

	const status = statusData?.data ?? {
		canSend: false,
		configured: false,
		lastTestAt: null,
		lastTestSuccess: false,
	};

	return {
		config,
		configLoading,
		status,
		statusLoading,
		testMutation,
		updateMutation,
	};
}
