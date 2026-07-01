import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

/** Generic 404 page displayed when no route matches the current URL. */
function NotFoundPage() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
			<div className="text-center">
				<h1 className="text-6xl font-bold tracking-tight">404</h1>
				<h2 className="text-muted-foreground mt-2 text-xl">Page not found</h2>
				<p className="text-muted-foreground mt-4 max-w-md text-sm">
					The page you are looking for does not exist or has been moved.
				</p>
			</div>
			<Button asChild variant="outline">
				<Link to="/dashboard">
					<ArrowLeft aria-hidden="true" className="mr-2 size-4" />
					Back to Dashboard
				</Link>
			</Button>
		</div>
	);
}

export { NotFoundPage };
