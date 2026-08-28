import type { BugReport } from '@/api/types';

interface BugLinksProps {
	bug: BugReport;
	/** Open the report on the other end of the link. */
	onOpenReport: (id: number) => void;
}

/**
 * Which report replaced this one, or which ones it replaced.
 *
 * A correction to a submitted report has to be filed as a second report, because a report cannot be
 * edited once it is in. Before this, the only record that the two were the same thing was a
 * sentence inside one of them, so the inbox showed two pieces of open work and a triager had to
 * read both to find out it was one. Naming the relationship in both directions is what lets either
 * report be read on its own and still say which of the pair is current.
 *
 * Both directions are links rather than text: a superseded report is left out of the default
 * listing, so a triager reading the correction has nowhere to go to see what it corrected unless
 * the number takes them there.
 */
function BugLinks({ bug, onOpenReport }: BugLinksProps) {
	const replaces = bug.supersedesIds;
	const replacedBy = bug.supersededById;

	if (replacedBy === null && replaces.length === 0) {
		return <span className="text-sm text-muted-foreground">—</span>;
	}

	return (
		<div className="flex flex-col gap-0.5 text-xs">
			{replacedBy === null ? null : (
				<span className="text-muted-foreground">
					Superseded by{' '}
					<button
						className="cursor-pointer font-mono hover:underline"
						onClick={() => {
							onOpenReport(replacedBy);
						}}
						type="button">
						#{replacedBy}
					</button>
				</span>
			)}
			{replaces.length === 0 ? null : (
				<span className="text-muted-foreground">
					Replaces{' '}
					{replaces.map((id, index) => (
						<span key={id}>
							{index > 0 ? ', ' : ''}
							<button
								className="cursor-pointer font-mono hover:underline"
								onClick={() => {
									onOpenReport(id);
								}}
								type="button">
								#{id}
							</button>
						</span>
					))}
				</span>
			)}
		</div>
	);
}

export { BugLinks };
