import { verifyEmailToken } from '@/api/auth';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { AuthStatusMessage } from '@/components/auth/AuthStatusMessage';
import { CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { useTokenVerification } from './useTokenVerification';

/** Email verification page that validates a token from a verification link. */
function VerifyEmailPage() {
	const { isInvalid, isPending, isSuccess } = useTokenVerification(verifyEmailToken);

	if (isPending) {
		return (
			<AuthPageLayout
				description="Please wait while we verify your email address."
				title="Verifying Email">
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
				description="Your email address has been verified successfully."
				linkText="Sign in to your account"
				linkTo="/login"
				title="Email Verified"
			/>
		);
	}

	return (
		<AuthStatusMessage
			description={
				isInvalid
					? 'This email verification link is invalid.'
					: 'This verification link is invalid or has expired.'
			}
			linkText="Back to login"
			linkTo="/login"
			title={isInvalid ? 'Invalid Link' : 'Verification Failed'}
		/>
	);
}

export { VerifyEmailPage };
