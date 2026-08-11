import { Play } from 'lucide-react';

import type { HealthCheck } from '@/api/health';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { statusBadgeVariant } from './healthStatusUtils';
import { StatusGlyph } from './StatusGlyph';

interface CheckCardProps {
	check: HealthCheck;
	/** True only while *this* check is running, so one click does not disable all four. */
	isRunning: boolean;
	onRun: (checkType: string) => void;
	runDisabled: boolean;
}

export function CheckCard({ check, isRunning, onRun, runDisabled }: CheckCardProps) {
	return (
		// `py-3` overrides Card's own `py-6`; CardContent keeps the standard `px-6` so this row
		// lines up horizontally with every other card on the page. Never add a bare `p-*` to
		// CardContent — it adds to the vertical padding and replaces the horizontal.
		<Card className="py-3">
			<CardContent className="flex items-center justify-between gap-4">
				<div>
					<p className="text-sm font-medium capitalize">{check.checkType}</p>
					<p className="text-xs text-muted-foreground">{check.durationMs}ms</p>
				</div>
				<div className="flex items-center gap-3">
					{/*
					 * One status mark, not two. The green check glyph used to sit at the left of the
					 * row and the green `healthy` badge at the right, both saying the same thing in
					 * the same colour on four consecutive cards. Badge reserves `[&>svg]:size-3` and
					 * `gap-1` for exactly this, so the glyph now travels with the word.
					 */}
					<Badge variant={statusBadgeVariant(check.status)}>
						<StatusGlyph status={check.status} />
						{check.status}
					</Badge>
					<Button
						aria-label={`Run ${check.checkType} check`}
						disabled={runDisabled}
						onClick={() => onRun(check.checkType)}
						size="sm"
						variant="outline">
						{/* Button supplies `gap-1.5` at size sm; `mr-1` was doubling it. */}
						<Play aria-hidden="true" className="size-3" />
						{isRunning ? 'Running…' : 'Run'}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
