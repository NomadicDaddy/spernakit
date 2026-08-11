import type { ReactNode } from 'react';

interface PreferenceGroupProps {
	children: ReactNode;
	description: string;
	label: string;
	/** Put an id on the label when the control below needs to point at it — a radiogroup does. */
	labelId?: string;
}

/**
 * One labelled setting inside a grouped preferences card.
 *
 * Each of these used to be a full-width `Card` of its own, so thirteen controls occupied seven
 * card headers and ~1847px of scroll, several of them filled to about a sixth of their width. The
 * card is now the *group* — Appearance, Layout — and this is the row inside it.
 */
function PreferenceGroup({ children, description, label, labelId }: PreferenceGroupProps) {
	return (
		<div className="space-y-3">
			<div>
				<p className="text-sm font-medium" id={labelId}>
					{label}
				</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			{children}
		</div>
	);
}

export { PreferenceGroup };
