import { cn } from '@/lib/utils';

type BbsFrameProps = {
	children: React.ReactNode;
	className?: string;
	title?: string;
};

/**
 * ASCII box-drawing character border wrapper for BBS super-theme.
 * Drops borders below md breakpoint for mobile usability.
 * Uses a single render of children to avoid double-mounting.
 */
function BbsFrame({ children, className, title }: BbsFrameProps) {
	return (
		<div className={cn('relative', className)}>
			{/* Top border — desktop only */}
			<div className="text-border hidden items-center text-sm md:flex">
				<span>{title ? `\u250C\u2500\u2524 ${title} \u251C` : '\u250C'}</span>
				<span className="flex-1 overflow-hidden whitespace-nowrap">
					{'\u2500'.repeat(200)}
				</span>
				<span>{'\u2510'}</span>
			</div>

			{/* Content row — side borders on desktop */}
			<div className="md:text-border flex min-h-0">
				<span className="text-border hidden text-sm md:block">{'\u2502'}</span>
				<div className="min-w-0 flex-1">{children}</div>
				<span className="text-border hidden text-sm md:block">{'\u2502'}</span>
			</div>

			{/* Bottom border — desktop only */}
			<div className="text-border hidden items-center text-sm md:flex">
				<span>{'\u2514'}</span>
				<span className="flex-1 overflow-hidden whitespace-nowrap">
					{'\u2500'.repeat(200)}
				</span>
				<span>{'\u2518'}</span>
			</div>
		</div>
	);
}

export { BbsFrame };
