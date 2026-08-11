import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ErdDiagramControlProps {
	children: React.ReactNode;
	disabled?: boolean;
	label: string;
	onClick: () => void;
}

/**
 * One icon button in the ERD's view toolbar.
 *
 * The glyphs carry no text, so the label is the only thing that names the action — it is both the
 * accessible name and the tooltip, which keeps the two from drifting apart.
 */
function ErdDiagramControl({ children, disabled = false, label, onClick }: ErdDiagramControlProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
					size="icon-sm"
					variant="outline">
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

export { ErdDiagramControl };
