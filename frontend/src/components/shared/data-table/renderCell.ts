import { type ColumnDefTemplate, flexRender } from '@tanstack/react-table';
import { type ReactNode } from 'react';

/**
 * Render a column's cell by *calling* its renderer rather than mounting it as a component.
 *
 * `flexRender` does `createElement(fn, context)` when a column's `cell` is a function, which makes
 * that arrow the element *type*. No column hook in this app memoises its `columns` array, so every
 * parent render builds new arrows, every arrow is a new type, and React unmounts and remounts every
 * cell's whole subtree. Typing one character into the search box on /settings/users was enough to
 * leave the row's "User actions" button with `isConnected === false` while its `<tr>` and `<td>`
 * stayed put. That cost keyboard focus inside every table (WCAG 2.4.3), discarded TaskScheduleCell's
 * half-typed cron draft, and left a dialog opened from a row menu with no opener to return focus to
 * — see lib/focusReturn.ts, which correctly falls back rather than focusing a detached node.
 *
 * Calling the renderer takes identity out of the equation entirely: what comes back is ordinary JSX
 * whose types (Badge, DropdownMenu, UserStatusBadge) are stable across renders, so React reconciles
 * in place. Memoising the seven column hooks would also work, but only after useAuthorization and
 * useFormatters were made to return stable identities and all seven caller pages wrapped their row
 * handlers — sixteen files to buy what this buys in one.
 *
 * The one rule this imposes: **a cell renderer must not call a hook.** It is a plain function here,
 * not a component, so a hook inside one would break the rules of hooks. Anything stateful belongs in
 * a component rendered *inside* the cell, which is how TaskScheduleCell is already built. Non-
 * function templates (a bare string or element) still go through `flexRender` unchanged.
 */
function renderCell<TProps extends object>(
	template: ColumnDefTemplate<TProps> | undefined,
	props: TProps,
): ReactNode {
	if (typeof template === 'function') {
		// `ColumnDefTemplate`'s call signature returns `any`, so the result goes through `unknown`
		// rather than being returned straight out of a function annotated `ReactNode`. TanStack's own
		// `flexRender` narrows the same value the same way; this keeps the assertion in one place
		// instead of suppressing @typescript-eslint/no-unsafe-return at every call site.
		const rendered: unknown = template(props);
		return rendered as ReactNode;
	}
	return flexRender(template, props);
}

export { renderCell };
