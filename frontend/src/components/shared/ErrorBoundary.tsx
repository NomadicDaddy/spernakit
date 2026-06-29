import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ApiError } from '@/api/apiError';
import { Button } from '@/components/ui/button';

/** Props accepted by the {@link ErrorBoundary} component. */
interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
	/** Called before clearing the boundary, e.g. to reset TanStack Query error state. */
	onReset?: () => void;
}

interface ErrorBoundaryState {
	error: Error | null;
	hasError: boolean;
}

/** Derive a user-friendly message from the caught error. */
function getUserMessage(error: Error | null): string {
	if (error instanceof ApiError) {
		if (error.status === 429) {
			return 'Too many requests. Please wait a moment and try again.';
		}
		if (error.status >= 500) {
			return 'The server encountered an error. Please try again later.';
		}
	}
	if (import.meta.env.DEV) {
		return error?.message ?? 'An unexpected error occurred.';
	}
	return 'An unexpected error occurred.';
}

/**
 * React error boundary that catches rendering errors and unhandled query
 * errors (via TanStack Query `throwOnError`) in its subtree.
 *
 * Displays a context-aware fallback message with a retry button,
 * or a custom `fallback` element when provided.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { error: null, hasError: false };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error, hasError: true };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		if (import.meta.env.DEV) {
			console.error('ErrorBoundary caught:', error, info);
		}
	}

	handleReset = (): void => {
		// Reset errored queries first so re-rendered children refetch instead of
		// immediately re-throwing the cached query error back into the boundary.
		this.props.onReset?.();
		this.setState({ error: null, hasError: false });
	};

	override render(): ReactNode {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-6">
					<div className="text-center">
						<h2 className="text-xl font-semibold">Something went wrong</h2>
						<p className="text-muted-foreground mt-2 max-w-md text-sm">
							{getUserMessage(this.state.error)}
						</p>
					</div>
					<Button onClick={this.handleReset} variant="outline">
						Try Again
					</Button>
				</div>
			);
		}

		return this.props.children;
	}
}

export { ErrorBoundary };
