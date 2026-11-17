/**
 * The registration point for cleanup an application needs when a workspace is deleted.
 *
 * A derived application registers its handlers from its own startup code, such as the module that
 * mounts its domain routes, so it never edits the template-owned workspaceCrud.ts. softDelete runs
 * every registered handler inside the same transaction as the workspace's own soft delete, after
 * that update and in registration order. A handler that throws rolls the whole delete back, so
 * cleanup never half-happens, and the error names the handler.
 */
import type { getDb } from '../../db/index.ts';

type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

interface WorkspaceDeletedContext {
	/** The user performing the delete. */
	deletedBy: number;
	/** The delete's transaction; write through it so the cleanup commits or rolls back with it. */
	tx: DbTransaction;
	/** The workspace being deleted. */
	workspaceId: number;
}

/** Must finish synchronously: the transaction cannot wait for a promise. */
type WorkspaceDeletedHandler = (context: WorkspaceDeletedContext) => void;

class WorkspaceDeletedHandlerError extends Error {
	readonly handlerName: string;

	constructor(handlerName: string, cause: unknown) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		super(`Workspace-deleted handler "${handlerName}" failed: ${reason}`, { cause });
		this.name = 'WorkspaceDeletedHandlerError';
		this.handlerName = handlerName;
	}
}

const handlers = new Map<string, WorkspaceDeletedHandler>();

/**
 * Register a handler to run whenever a workspace is soft-deleted.
 * Throws if a handler with the same name is already registered.
 *
 * @param name - A unique name, reported if the handler fails
 * @param handler - Synchronous cleanup that writes through context.tx
 */
function onWorkspaceDeleted(name: string, handler: WorkspaceDeletedHandler): void {
	if (handlers.has(name)) {
		throw new Error(
			`Workspace-deleted handler "${name}" is already registered. Duplicate names are not allowed.`,
		);
	}
	handlers.set(name, handler);
}

/**
 * Run every registered handler in registration order. Called by softDelete inside its
 * transaction; any failure is rethrown as a WorkspaceDeletedHandlerError naming the handler.
 *
 * @param context - The workspace, the deleting user and the delete's transaction
 */
function runWorkspaceDeletedHandlers(context: WorkspaceDeletedContext): void {
	for (const [name, handler] of handlers) {
		let result: unknown;
		try {
			result = handler(context);
		} catch (err) {
			throw new WorkspaceDeletedHandlerError(name, err);
		}
		if (result instanceof Promise) {
			// The work it started is outside the transaction; refuse rather than half-clean.
			result.catch(() => undefined);
			throw new WorkspaceDeletedHandlerError(
				name,
				new Error('handlers must be synchronous; it returned a promise'),
			);
		}
	}
}

export { onWorkspaceDeleted, runWorkspaceDeletedHandlers, WorkspaceDeletedHandlerError };
export type { WorkspaceDeletedContext, WorkspaceDeletedHandler };
