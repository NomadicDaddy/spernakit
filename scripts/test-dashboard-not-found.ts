#!/usr/bin/env bun
/**
 * Regression coverage for a deleted dashboard's not-found state
 * (`.aidd/features/remediation-20260827-deleted-dashboard-renders-an-empty-boundary`).
 *
 * The defect this gate was written for: opening `/dashboards/:id` for a dashboard that had been
 * deleted spent three retries with exponential backoff on a 404 that was already final, then threw
 * it past the page's own not-found branch into the error boundary. What the user saw for those
 * seven seconds was a skeleton, and what they saw afterwards was a generic failure rather than the
 * page naming the thing that was missing and offering the way back to the list.
 *
 * The property under test is that a 404 is an answer rather than a failure, and that the rule lives
 * in the query client where every page inherits it. The gate drives the real API client against a
 * stubbed 404, renders the real page, and reads the text a user would see. It also holds the other
 * half of the contract: an error that is genuinely unexpected still throws, and the boundary that
 * catches it still renders something readable and recoverable.
 *
 * Runs in process. Nothing here touches the network, the database, or a browser.
 */
import {
	loadFromFrontend,
	type ReactModule,
	seedBrowserGlobals,
	type ServerRenderModule,
	visibleText,
} from './lib/frontend-render.ts';

const DASHBOARD_ID = 4242;
const DASHBOARD_PATH = `/dashboards/${String(DASHBOARD_ID)}`;

const failures: string[] = [];
/**
 * Record a failure when a condition does not hold.
 *
 * @param condition - The expectation being checked.
 * @param message - What was expected, phrased so the failure output reads on its own.
 */
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

type ApiErrorClass = new (message: string, status: number) => Error;

interface QueryDefaults {
	queries?: {
		retry?: (failureCount: number, error: Error) => boolean;
		retryOnMount?: boolean;
		throwOnError?: (error: Error) => boolean;
	};
}
interface DefaultOptionsHolder {
	getDefaultOptions: () => QueryDefaults;
}
interface TestClient {
	prefetchQuery: (options: {
		queryFn: () => Promise<unknown>;
		queryKey: unknown[];
	}) => Promise<void>;
}

/**
 * Answer every request with the 404 envelope the dashboards routes actually return.
 *
 * @returns The URLs the frontend asked for, in order, so the gate can prove it asked once.
 */
function stubNotFoundFetch(): string[] {
	const requested: string[] = [];
	const scope = globalThis as unknown as Record<string, unknown>;
	scope.fetch = (input: unknown): Promise<Response> => {
		requested.push(String(input));
		return Promise.resolve(
			new Response(
				JSON.stringify({
					code: 'RESOURCE_NOT_FOUND',
					error: 'Not Found',
					message: 'Dashboard not found',
				}),
				{ headers: { 'Content-Type': 'application/json' }, status: 404 },
			),
		);
	};
	return requested;
}

/**
 * Assert the shared rule directly, so the contract holds even where no page has consumed it yet.
 *
 * @param ApiError - The frontend's API error class.
 * @param queryClient - The application's configured query client.
 */
function sharedRule(ApiError: ApiErrorClass, queryClient: DefaultOptionsHolder): void {
	const queries = queryClient.getDefaultOptions().queries;
	const retry = queries?.retry;
	const throwOnError = queries?.throwOnError;
	if (typeof retry !== 'function' || typeof throwOnError !== 'function') {
		assert(false, 'the query client no longer declares retry and throwOnError as functions');
		return;
	}

	const notFound = new ApiError('Dashboard not found', 404);
	assert(!retry(0, notFound), 'a 404 must not be retried: the answer will not change');
	assert(
		!throwOnError(notFound),
		'a 404 must not be thrown: the page that asked owns the not-found message',
	);
	assert(
		throwOnError(new ApiError('Internal Server Error', 500)),
		'a 500 must still reach the error boundary',
	);
	assert(
		!throwOnError(new ApiError('Access denied', 403)),
		'a 403 must still be left to the page, as it was before',
	);
}

/**
 * Render the real dashboard detail page against a 404 and read what a user would see.
 *
 * @param react - React, resolved from the frontend workspace.
 * @param server - React's static markup renderer.
 */
async function notFoundPage(react: ReactModule, server: ServerRenderModule): Promise<void> {
	const requested = stubNotFoundFetch();
	const { queryClient } = await loadFromFrontend<{ queryClient: DefaultOptionsHolder }>(
		'./src/lib/queryClient.ts',
	);
	const { QueryClient, QueryClientProvider } = await loadFromFrontend<{
		QueryClient: new (config: unknown) => TestClient;
		QueryClientProvider: unknown;
	}>('@tanstack/react-query');
	const { MemoryRouter, Route, Routes } =
		await loadFromFrontend<Record<string, unknown>>('react-router');
	const { getDashboard } = await loadFromFrontend<{
		getDashboard: (id: number) => Promise<unknown>;
	}>('./src/api/dashboards.ts');
	const { CustomDashboardPage } = await loadFromFrontend<{ CustomDashboardPage: unknown }>(
		'./src/pages/dashboards/CustomDashboardPage.tsx',
	);

	/*
	 * The application's own defaults, with one accommodation for rendering without a browser. An
	 * errored query refetches on mount and TanStack reports that pending refetch optimistically as
	 * `isLoading`, which is the skeleton frame a real user sees for an instant before the refetch
	 * resolves. A static render runs no effects, so that frame would be the only one this gate ever
	 * saw. `retryOnMount: false` moves it to the state the user actually ends on. Everything the
	 * feature is about, the retry rule and the throw rule, comes from the real defaults untouched.
	 */
	const defaults = queryClient.getDefaultOptions();
	const client = new QueryClient({
		defaultOptions: { ...defaults, queries: { ...defaults.queries, retryOnMount: false } },
	});
	await client.prefetchQuery({
		queryFn: () => getDashboard(DASHBOARD_ID),
		queryKey: ['dashboard', DASHBOARD_ID],
	});

	assert(
		requested.length === 1,
		`the 404 was fetched ${String(requested.length)} times; a final answer is asked for once`,
	);

	let markup: string;
	try {
		markup = server.renderToStaticMarkup(
			react.createElement(
				QueryClientProvider,
				{ client },
				react.createElement(
					MemoryRouter,
					{ initialEntries: [DASHBOARD_PATH] },
					react.createElement(
						Routes,
						null,
						react.createElement(Route, {
							element: react.createElement(CustomDashboardPage, null),
							path: '/dashboards/:id',
						}),
					),
				),
			),
		);
	} catch (err) {
		assert(false, `the page threw instead of rendering its not-found state: ${String(err)}`);
		return;
	}

	const text = visibleText(markup);
	assert(
		text.includes('Dashboard not found'),
		`the page did not say the dashboard was not found; it rendered: ${text.slice(0, 200) || '(nothing)'}`,
	);
	assert(
		markup.includes('href="/dashboards"'),
		'the not-found state did not offer a way back to the dashboard list',
	);
}

/**
 * Prove the boundary still answers an unexpected error with text a user can read and act on.
 *
 * A static render does not run class error boundaries, so the fallback is driven the way React
 * would drive it: derive the error state, then render the instance. Both branches of the
 * boundary's message are covered, because an empty boundary is the defect wherever it appears.
 *
 * @param server - React's static markup renderer.
 * @param ApiError - The frontend's API error class.
 */
async function boundaryStillSpeaks(
	server: ServerRenderModule,
	ApiError: ApiErrorClass,
): Promise<void> {
	const { ErrorBoundary } = await loadFromFrontend<{
		ErrorBoundary: {
			getDerivedStateFromError: (error: Error) => unknown;
			new (props: unknown): { render: () => unknown; state: unknown };
		};
	}>('./src/components/shared/ErrorBoundary.tsx');

	for (const error of [new ApiError('Internal Server Error', 500), new Error('unexpected')]) {
		const boundary = new ErrorBoundary({ children: null });
		boundary.state = ErrorBoundary.getDerivedStateFromError(error);
		const text = visibleText(server.renderToStaticMarkup(boundary.render()));
		assert(
			text.length > 0,
			`the error boundary rendered nothing for ${error.constructor.name}; that is the defect`,
		);
		assert(
			text.includes('Something went wrong') && text.includes('Try Again'),
			`the error boundary lost its message or its recovery action; it rendered: ${text.slice(0, 200)}`,
		);
	}
}

/** Run every check and report once. */
async function run(): Promise<void> {
	seedBrowserGlobals(DASHBOARD_PATH);

	const react = await loadFromFrontend<ReactModule>('react');
	const server = await loadFromFrontend<ServerRenderModule>('react-dom/server.node');
	const { ApiError } = await loadFromFrontend<{ ApiError: ApiErrorClass }>(
		'./src/api/apiError.ts',
	);
	const { queryClient } = await loadFromFrontend<{ queryClient: DefaultOptionsHolder }>(
		'./src/lib/queryClient.ts',
	);

	sharedRule(ApiError, queryClient);
	await notFoundPage(react, server);
	await boundaryStillSpeaks(server, ApiError);

	if (failures.length === 0) {
		console.log(
			'[OK] dashboard-not-found: 4 query rules held, the page named the missing dashboard, and the boundary spoke for 2 unexpected errors',
		);
		process.exit(0);
	}
	console.error('[FAIL] dashboard-not-found:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-dashboard-not-found:', err);
	process.exit(1);
});
