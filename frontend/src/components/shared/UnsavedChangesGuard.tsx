import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

import { ConfirmAlertDialog } from './ConfirmAlertDialog';

interface UnsavedChangesGuardProps {
	isDirty: boolean;
}

/**
 * Blocks client-side navigation and browser unload while the form is dirty, and owns the
 * confirmation dialog that lets the user leave anyway.
 *
 * Mount this instead of calling `useUnsavedChanges` directly. That hook returns a blocker
 * which does nothing on its own — a caller that discards the return value blocks navigation
 * and then renders no dialog, silently trapping the user on the page with no explanation
 * and no way out. Two of the four call sites did exactly that. A component cannot be
 * discarded the same way: rendering it is the whole call.
 *
 * React Router supports a single blocker at a time, so mount at most one guard per page.
 * Child components that only need the browser's native unload prompt should use
 * `useBeforeUnload` instead.
 */
function UnsavedChangesGuard({ isDirty }: UnsavedChangesGuardProps) {
	const blocker = useUnsavedChanges(isDirty);

	return (
		<ConfirmAlertDialog
			description="You have unsaved changes. Are you sure you want to leave?"
			isOpen={blocker.state === 'blocked'}
			onConfirm={() => blocker.proceed?.()}
			onOpenChange={(open) => {
				if (!open) blocker.reset?.();
			}}
			title="Unsaved Changes"
			variant="destructive"
		/>
	);
}

export { UnsavedChangesGuard };
