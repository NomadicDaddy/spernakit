import { Link } from 'react-router-dom';

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
			{label && <span className="text-muted-foreground text-sm">{label} </span>}
			<Link
				className="text-primary focus-visible:ring-ring rounded-sm text-sm hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
				to={to}>
				{linkText}
			</Link>
		</div>
	);
}

export { AuthFooterLink };
