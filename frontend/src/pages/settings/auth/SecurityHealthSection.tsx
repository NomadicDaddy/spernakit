import { AlertTriangle, CheckCircle, ShieldAlert, ShieldCheck } from 'lucide-react';

import type { SecurityHealthReport, SecurityHealthUser } from '@/api/types';

import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { Badge } from '@/components/ui/badge';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

function SecurityHealthSection({
	data,
	isLoading,
}: {
	data: SecurityHealthReport | undefined;
	isLoading: boolean;
}) {
	if (isLoading) {
		return <CardSkeleton contentLines={4} titleWidth="h-6 w-48" />;
	}

	if (!data) return null;

	const report = data;

	const usersWithIssues = report.users.filter((u: SecurityHealthUser) => u.issues.length > 0);
	const totalIssues = usersWithIssues.reduce(
		(sum: number, u: SecurityHealthUser) => sum + u.issues.length,
		0,
	);

	return (
		<Card>
			<CardHeader>
				{/*
				 * The title used to sit in a `flex` wrapper with a fixed `ShieldAlert`, which pushed
				 * it 28px right of every other CardTitle on the surface and warned of a problem even
				 * when every account was compliant. The icon now lives in the header's action slot,
				 * leaves the title flush with its siblings, and reads the state it describes.
				 */}
				<CardTitle>Security Health</CardTitle>
				<CardDescription>
					Security compliance overview across all user accounts
				</CardDescription>
				<CardAction>
					{totalIssues === 0 ? (
						<ShieldCheck aria-hidden="true" className="size-5 text-success" />
					) : (
						<ShieldAlert aria-hidden="true" className="size-5 text-warning" />
					)}
				</CardAction>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center gap-3">
					{totalIssues === 0 ? (
						<>
							<CheckCircle aria-hidden="true" className="h-5 w-5 text-success" />
							<span className="text-sm font-medium">
								All {report.users.length} users are compliant
							</span>
						</>
					) : (
						<>
							<AlertTriangle aria-hidden="true" className="h-5 w-5 text-warning" />
							<span className="text-sm font-medium">
								{usersWithIssues.length} of {report.users.length} users have issues
								({totalIssues} total)
							</span>
						</>
					)}
				</div>

				{usersWithIssues.length > 0 && (
					<div className="space-y-2">
						{usersWithIssues.map((user: SecurityHealthUser) => (
							<div
								className="flex items-center justify-between rounded-lg border p-3"
								key={user.id}>
								<div>
									<span className="text-sm font-medium">{user.username}</span>
									<span className="ml-2 text-xs text-muted-foreground">
										{user.email}
									</span>
								</div>
								<div className="flex gap-1">
									{user.issues.map((issue: string) => (
										<Badge key={issue} variant="destructive">
											{issue}
										</Badge>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export { SecurityHealthSection };
