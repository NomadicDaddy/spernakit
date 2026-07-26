import { Link } from 'react-router';

import { CardContent } from '@/components/ui/card';

import { AuthPageLayout } from './AuthPageLayout';

interface AuthStatusMessageProps {
	description: string;
	linkText: string;
	linkTo: string;
	title: string;
}

function AuthStatusMessage({ description, linkText, linkTo, title }: AuthStatusMessageProps) {
	return (
		<AuthPageLayout description={description} title={title}>
			<CardContent className="text-center">
				<Link
					className="rounded-sm text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
					to={linkTo}>
					{linkText}
				</Link>
			</CardContent>
		</AuthPageLayout>
	);
}

export { AuthStatusMessage };
