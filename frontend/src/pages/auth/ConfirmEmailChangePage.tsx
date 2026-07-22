import { confirmEmailChangeToken } from '@/api/auth';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { AuthStatusMessage } from '@/components/auth/AuthStatusMessage';
import { CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { useTokenVerification } from './useTokenVerification';

/** Confirms a pending email change via a token delivered to the new address. */
function ConfirmEmailChangePage() {
	const { isInvalid, isPending, isSuccess } = useTokenVerification(confirmEmailChangeToken);

	if (isPending) {
		return (
			<AuthPageLayout
				description="Please wait while we confirm your new email address."
				title="Confirming Email Change">
				<CardContent className="space-y-3">
					<Skeleton className="mx-auto h-4 w-48" />
					<Skeleton className="mx-auto h-4 w-32" />
				</CardContent>
			</AuthPageLayout>
		);
	}

	if (isSuccess) {
		return (
			<AuthStatusMessage
				description="Your new email address is now active. For your security, all existing sessions have been signed out. Please sign in again."
				linkText="Sign in to your account"
				linkTo="/login"
				title="Email Change Confirmed"
			/>
		);
	}

	return (
		<AuthStatusMessage
			description={
				isInvalid
					? 'This email change link is invalid.'
					: 'This email change link is invalid or has expired.'
			}
			linkText="Back to login"
			linkTo="/login"
			title={isInvalid ? 'Invalid Link' : 'Confirmation Failed'}
		/>
	);
}

export { ConfirmEmailChangePage };
