import { Link } from 'react-router';

interface AuthFooterLinkProps {
	className?: string;
	label?: string;
	linkText: string;
	to: string;
}

function AuthFooterLink({
	className = 'mt-4 text-center',
	label,
	linkText,
	to,
}: AuthFooterLinkProps) {
	return (
		<div className={className}>
			{label && <span className="text-sm text-muted-foreground">{label} </span>}
			<Link
				className="rounded-sm text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
				to={to}>
				{linkText}
			</Link>
		</div>
	);
}

export { AuthFooterLink };
