import { useState } from 'react';

/**
 * Puts a dialog's form back to its starting state each time the dialog opens, and at no other time.
 *
 * A dialog that hands its form to a callback learns nothing about what happened next: the mutation
 * resolves later and can resolve as a refusal. Clearing the fields on the way out of the submit
 * therefore clears them whether the record was created or rejected, which is how Create User came
 * to answer a refused username with three empty fields and a toast that faded. Clearing when the
 * dialog closes instead has the opposite problem, because Radix only reports a close the dialog
 * itself asked for. A parent that closes the dialog on success by setting `isOpen` never triggers
 * it, so the next open still holds the last record's values.
 *
 * Opening is the moment that is both reliable and correct. It is reliable because `isOpen` is the
 * prop the parent already drives, whichever way the dialog was closed, and correct because a form
 * being shown for a new record is the one time nobody has anything invested in what is in it.
 *
 * The comparison is against `openedFor`, which nothing but this hook writes. That matters: a guard
 * that ran during render against state a control renders would be re-armed by the typing it is
 * meant to leave alone, which is the defect `test:render-phase-sync` exists to catch.
 *
 * @param isOpen - Whether the dialog is currently open, as the parent sees it.
 * @param startFresh - Puts the form back to its starting state. Called during render, so it must
 *   do nothing but set state.
 */
function useFreshOnOpen(isOpen: boolean, startFresh: () => void): void {
	const [openedFor, setOpenedFor] = useState(isOpen);

	if (isOpen !== openedFor) {
		setOpenedFor(isOpen);
		if (isOpen) startFresh();
	}
}

export { useFreshOnOpen };
